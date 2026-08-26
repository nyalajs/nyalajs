import { Transporter, MessageHandler, EventHandler, IncomingCall } from "../transporter.interface";

export interface KafkaTransporterOptions {
    clientId: string;
    brokers: string[];
    /** Consumer group id. Defaults to `${clientId}-server`. */
    groupId?: string;
    /** Topic prefix for both message and event patterns. Defaults to "nyala.rpc". */
    topicPrefix?: string;
    ssl?: boolean;
    sasl?: { mechanism: "plain" | "scram-sha-256" | "scram-sha-512"; username: string; password: string };
    /** On close(), how long to wait for in-flight handler calls to finish. Defaults to 10s. */
    drainTimeoutMs?: number;
}

interface Envelope {
    payload: any;
    trace: { requestId: string; traceId: string; tenantId?: string };
    correlationId?: string;
    replyTopic?: string;
}

/**
 * Server-side Kafka transport. Kafka is a durable log, not a request-reply
 * broker — there's no built-in "respond to this specific message" the way
 * NATS or a TCP socket has. So a "message" pattern's reply travels back on
 * a caller-provided reply topic (`replyTopic` in the envelope), keyed by a
 * correlationId, same shape as the Redis transport's per-call reply
 * channel — except Kafka handlers here consume from one shared topic per
 * pattern rather than per-call, since creating a topic per RPC call isn't
 * viable. "event" patterns map onto plain topic consumption, which is
 * Kafka's native strength.
 */
export class KafkaTransporter implements Transporter {
    private readonly topicPrefix: string;
    private readonly messageHandlers = new Map<string, MessageHandler>();
    private readonly eventHandlers = new Map<string, EventHandler>();
    private consumer?: any;
    private producer?: any;
    private inFlight = 0;
    private closing = false;
    private connected = false;

    constructor(private readonly options: KafkaTransporterOptions) {
        this.topicPrefix = options.topicPrefix ?? "nyala.rpc";
    }

    addMessageHandler(pattern: string, handler: MessageHandler): void {
        this.messageHandlers.set(pattern, handler);
    }

    addEventHandler(pattern: string, handler: EventHandler): void {
        this.eventHandlers.set(pattern, handler);
    }

    async listen(): Promise<void> {
        const { Kafka } = this.loadKafkaJs();

        const kafka = new Kafka({
            clientId: this.options.clientId,
            brokers: this.options.brokers,
            ssl: this.options.ssl,
            sasl: this.options.sasl,
        });

        this.producer = kafka.producer();
        await this.producer.connect();

        this.consumer = kafka.consumer({ groupId: this.options.groupId ?? `${this.options.clientId}-server` });
        await this.consumer.connect();

        const topics = [...this.messageHandlers.keys(), ...this.eventHandlers.keys()].map((pattern) =>
            this.topic(pattern)
        );

        if (topics.length === 0) return;

        // Explicitly create pattern topics up front rather than relying on
        // the broker's auto-create-on-produce/subscribe behavior: besides
        // most managed Kafka services (Confluent Cloud, MSK) disabling
        // auto-creation by default, even a broker with it enabled still
        // races — the very first subscribe/produce against a topic that
        // doesn't exist yet can fail with UNKNOWN_TOPIC_OR_PARTITION before
        // the auto-created topic's metadata has propagated.
        const admin = kafka.admin();
        await admin.connect();
        try {
            const existing = await admin.listTopics();
            const missing = topics.filter((topic) => !existing.includes(topic));
            if (missing.length > 0) {
                await admin.createTopics({ topics: missing.map((topic) => ({ topic })), waitForLeaders: true });
            }
        } finally {
            await admin.disconnect();
        }

        for (const topic of topics) {
            await this.consumer.subscribe({ topic, fromBeginning: false });
        }

        this.connected = true;

        await this.consumer.run({
            eachMessage: async ({ topic, message }: any) => {
                if (this.closing) return;
                await this.handleMessage(topic, message);
            },
        });
    }

    async isHealthy(): Promise<boolean> {
        return this.connected && !this.closing;
    }

    /**
     * Stops the consumer immediately (kafkajs's consumer.stop() lets any
     * eachMessage callback currently running finish before resolving), waits
     * (up to drainTimeoutMs) for this transport's own in-flight counter to
     * hit zero as a second safety net, then disconnects both clients.
     */
    async close(): Promise<void> {
        this.closing = true;

        if (this.consumer) {
            await this.consumer.stop().catch(() => {});
        }

        const drainTimeoutMs = this.options.drainTimeoutMs ?? 10_000;
        const deadline = Date.now() + drainTimeoutMs;
        while (this.inFlight > 0 && Date.now() < deadline) {
            await new Promise((resolve) => setTimeout(resolve, 25));
        }

        await this.consumer?.disconnect().catch(() => {});
        await this.producer?.disconnect().catch(() => {});
        this.connected = false;
    }

    private async handleMessage(topic: string, message: any): Promise<void> {
        const pattern = this.patternFromTopic(topic);
        const envelope: Envelope = JSON.parse(message.value.toString("utf8"));
        const call: IncomingCall = { payload: envelope.payload, trace: envelope.trace };

        if (this.messageHandlers.has(pattern)) {
            const handler = this.messageHandlers.get(pattern)!;
            this.inFlight++;
            try {
                const result = await handler(call);
                if (envelope.replyTopic && envelope.correlationId) {
                    await this.producer.send({
                        topic: envelope.replyTopic,
                        messages: [
                            {
                                value: JSON.stringify({
                                    correlationId: envelope.correlationId,
                                    payload: result,
                                    error: null,
                                }),
                            },
                        ],
                    });
                }
            } catch (error) {
                if (envelope.replyTopic && envelope.correlationId) {
                    await this.producer.send({
                        topic: envelope.replyTopic,
                        messages: [
                            {
                                value: JSON.stringify({
                                    correlationId: envelope.correlationId,
                                    payload: undefined,
                                    error: { message: (error as Error).message, name: (error as Error).name },
                                }),
                            },
                        ],
                    });
                }
            } finally {
                this.inFlight--;
            }
            return;
        }

        if (this.eventHandlers.has(pattern)) {
            const handler = this.eventHandlers.get(pattern)!;
            this.inFlight++;
            try {
                await handler(call);
            } catch (error) {
                console.error(
                    JSON.stringify({
                        level: "error",
                        message: "Unhandled @EventPattern handler error",
                        pattern,
                        error: (error as Error).message,
                    })
                );
            } finally {
                this.inFlight--;
            }
        }
    }

    private topic(pattern: string): string {
        return `${this.topicPrefix}.${pattern}`;
    }

    private patternFromTopic(topic: string): string {
        return topic.slice(this.topicPrefix.length + 1);
    }

    private loadKafkaJs(): any {
        try {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            return require("kafkajs");
        } catch {
            throw new Error(
                'KafkaTransporter requires the optional "kafkajs" peer dependency. Install it with: npm install kafkajs'
            );
        }
    }
}

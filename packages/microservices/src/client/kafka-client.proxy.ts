import { randomUUID } from "crypto";
import { ClientProxy } from "./client-proxy";
import { outgoingTrace } from "../context/trace-propagation";
import { KafkaTransporterOptions } from "../transports/kafka/kafka.transporter";

const DEFAULT_TIMEOUT_MS = 10_000;

interface PendingCall {
    resolve: (value: any) => void;
    reject: (reason: unknown) => void;
    timer: ReturnType<typeof setTimeout>;
}

/**
 * Client-side counterpart to KafkaTransporter. send() publishes to the
 * pattern's topic and waits for a reply on a dedicated reply topic unique
 * to this client instance (subscribed once, for the whole client's
 * lifetime, correlated per-call by correlationId) — see kafka.transporter.ts
 * for why Kafka needs an explicit reply-topic convention instead of native
 * request-reply.
 */
export class KafkaClientProxy extends ClientProxy {
    private readonly topicPrefix: string;
    private readonly replyTopic: string;
    private producer?: any;
    private consumer?: any;
    private readonly pending = new Map<string, PendingCall>();
    private connectPromise?: Promise<void>;

    constructor(private readonly options: KafkaTransporterOptions) {
        super();
        this.topicPrefix = options.topicPrefix ?? "nyala.rpc";
        this.replyTopic = `${this.topicPrefix}.reply.${options.clientId}.${randomUUID()}`;
    }

    async connect(): Promise<void> {
        if (this.producer) return;
        if (this.connectPromise) return this.connectPromise;

        this.connectPromise = this.doConnect().finally(() => {
            this.connectPromise = undefined;
        });
        return this.connectPromise;
    }

    private async doConnect(): Promise<void> {
        const { Kafka } = this.loadKafkaJs();
        const kafka = new Kafka({
            clientId: this.options.clientId,
            brokers: this.options.brokers,
            ssl: this.options.ssl,
            sasl: this.options.sasl,
        });

        this.producer = kafka.producer();
        await this.producer.connect();

        // Create this instance's reply topic explicitly rather than relying
        // on auto-creation — see the same note in kafka.transporter.ts.
        const admin = kafka.admin();
        await admin.connect();
        try {
            await admin.createTopics({ topics: [{ topic: this.replyTopic }], waitForLeaders: true });
        } finally {
            await admin.disconnect();
        }

        this.consumer = kafka.consumer({ groupId: `${this.options.clientId}-reply-${randomUUID()}` });
        await this.consumer.connect();
        await this.consumer.subscribe({ topic: this.replyTopic, fromBeginning: false });

        await this.consumer.run({
            eachMessage: async ({ message }: any) => {
                const decoded = JSON.parse(message.value.toString("utf8"));
                const call = this.pending.get(decoded.correlationId);
                if (!call) return;

                this.pending.delete(decoded.correlationId);
                clearTimeout(call.timer);

                if (decoded.error) {
                    const error = new Error(decoded.error.message);
                    error.name = decoded.error.name;
                    call.reject(error);
                } else {
                    call.resolve(decoded.payload);
                }
            },
        });
    }

    async close(): Promise<void> {
        await this.consumer?.disconnect().catch(() => {});
        await this.producer?.disconnect().catch(() => {});
        this.producer = undefined;
        this.consumer = undefined;
        for (const [id, call] of this.pending) {
            clearTimeout(call.timer);
            call.reject(new Error("Client closed"));
            this.pending.delete(id);
        }
    }

    async isHealthy(): Promise<boolean> {
        return !!this.producer;
    }

    async send<TResult = any, TPayload = any>(
        pattern: string,
        payload: TPayload,
        timeoutMs = DEFAULT_TIMEOUT_MS
    ): Promise<TResult> {
        await this.connect();

        const correlationId = randomUUID();
        const envelope = {
            payload,
            trace: outgoingTrace(),
            correlationId,
            replyTopic: this.replyTopic,
        };

        return new Promise<TResult>((resolve, reject) => {
            const timer = setTimeout(() => {
                this.pending.delete(correlationId);
                reject(new Error(`Timed out waiting for reply to "${pattern}" after ${timeoutMs}ms`));
            }, timeoutMs);

            this.pending.set(correlationId, { resolve, reject, timer });

            this.producer
                .send({ topic: this.topic(pattern), messages: [{ value: JSON.stringify(envelope) }] })
                .catch((error: Error) => {
                    this.pending.delete(correlationId);
                    clearTimeout(timer);
                    reject(error);
                });
        });
    }

    async emit<TPayload = any>(pattern: string, payload: TPayload): Promise<void> {
        await this.connect();
        const envelope = { payload, trace: outgoingTrace() };
        await this.producer.send({ topic: this.topic(pattern), messages: [{ value: JSON.stringify(envelope) }] });
    }

    private topic(pattern: string): string {
        return `${this.topicPrefix}.${pattern}`;
    }

    private loadKafkaJs(): any {
        try {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            return require("kafkajs");
        } catch {
            throw new Error(
                'KafkaClientProxy requires the optional "kafkajs" peer dependency. Install it with: npm install kafkajs'
            );
        }
    }
}

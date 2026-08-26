import { randomUUID } from "crypto";
import { Transporter, MessageHandler, EventHandler, IncomingCall } from "../transporter.interface";
import { createResponseFrame } from "../wire-protocol";

export interface RedisTransporterOptions {
    url?: string;
    host?: string;
    port?: number;
    password?: string;
    /** Prefix applied to every pub/sub channel, so multiple apps can share one Redis instance. Defaults to "nyala:rpc". */
    channelPrefix?: string;
    /**
     * On close(), how long to wait for in-flight handler calls to finish
     * before closing the Redis connections anyway. Defaults to 10s.
     */
    drainTimeoutMs?: number;
}

/**
 * Server-side Redis transport. Each pattern gets two channels:
 * `<prefix>:<pattern>` for incoming calls/events, and a one-shot reply
 * channel per call for the response to a "message" call (Redis pub/sub has
 * no built-in request-response, so the reply channel is created by the
 * caller and named in the envelope).
 */
export class RedisTransporter implements Transporter {
    private readonly channelPrefix: string;
    private readonly messageHandlers = new Map<string, MessageHandler>();
    private readonly eventHandlers = new Map<string, EventHandler>();
    private subscriber?: any;
    private publisher?: any;
    private inFlight = 0;
    private closing = false;
    private connected = false;

    constructor(private readonly options: RedisTransporterOptions = {}) {
        this.channelPrefix = options.channelPrefix ?? "nyala:rpc";
    }

    addMessageHandler(pattern: string, handler: MessageHandler): void {
        this.messageHandlers.set(pattern, handler);
    }

    addEventHandler(pattern: string, handler: EventHandler): void {
        this.eventHandlers.set(pattern, handler);
    }

    async listen(): Promise<void> {
        const Redis = this.loadIoredis();
        this.subscriber = this.createClient(Redis);
        this.publisher = this.createClient(Redis);

        this.installErrorLogging(this.subscriber, "subscriber");
        this.installErrorLogging(this.publisher, "publisher");

        this.subscriber.on("connect", () => (this.connected = true));
        this.subscriber.on("close", () => (this.connected = false));

        const channels = [...this.messageHandlers.keys(), ...this.eventHandlers.keys()].map(
            (pattern) => this.channel(pattern)
        );

        if (channels.length > 0) {
            await this.subscriber.subscribe(...channels);
        }

        await this.publisher.ping();
        this.connected = true;

        this.subscriber.on("message", (channel: string, raw: string) => {
            if (this.closing) return;

            this.handleMessage(channel, raw).catch((error) => {
                console.error(
                    JSON.stringify({
                        level: "error",
                        message: "Unhandled Redis transport error",
                        channel,
                        error: (error as Error).message,
                    })
                );
            });
        });
    }

    async isHealthy(): Promise<boolean> {
        if (!this.publisher || this.closing) return false;
        try {
            await this.publisher.ping();
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Stops processing new pub/sub messages immediately, waits (up to
     * `drainTimeoutMs`) for in-flight handler calls to finish, then closes
     * both Redis connections.
     */
    async close(): Promise<void> {
        this.closing = true;

        const drainTimeoutMs = this.options.drainTimeoutMs ?? 10_000;
        const deadline = Date.now() + drainTimeoutMs;
        while (this.inFlight > 0 && Date.now() < deadline) {
            await new Promise((resolve) => setTimeout(resolve, 25));
        }

        await this.subscriber?.quit().catch(() => {});
        await this.publisher?.quit().catch(() => {});
        this.connected = false;
    }

    private installErrorLogging(client: any, role: string): void {
        client.on("error", (error: Error) => {
            console.error(
                JSON.stringify({
                    level: "error",
                    message: `Redis ${role} connection error`,
                    error: error.message,
                })
            );
        });
    }

    private async handleMessage(channel: string, raw: string): Promise<void> {
        const pattern = this.patternFromChannel(channel);
        const envelope = JSON.parse(raw);
        const call: IncomingCall = {
            payload: envelope.payload,
            trace: envelope.trace ?? { requestId: envelope.id, traceId: envelope.id },
        };

        if (this.messageHandlers.has(pattern)) {
            const handler = this.messageHandlers.get(pattern)!;
            const replyChannel: string = envelope.replyChannel;

            this.inFlight++;
            try {
                const result = await handler(call);
                await this.publisher.publish(
                    replyChannel,
                    JSON.stringify(createResponseFrame(envelope.id, result))
                );
            } catch (error) {
                await this.publisher.publish(
                    replyChannel,
                    JSON.stringify(createResponseFrame(envelope.id, undefined, error as Error))
                );
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
            } finally {
                this.inFlight--;
            }
        }
    }

    private channel(pattern: string): string {
        return `${this.channelPrefix}:${pattern}`;
    }

    private patternFromChannel(channel: string): string {
        return channel.slice(this.channelPrefix.length + 1);
    }

    private createClient(Redis: any): any {
        if (this.options.url) {
            return new Redis(this.options.url);
        }
        return new Redis({
            host: this.options.host ?? "localhost",
            port: this.options.port ?? 6379,
            password: this.options.password,
        });
    }

    private loadIoredis(): any {
        try {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            return require("ioredis");
        } catch {
            throw new Error(
                'RedisTransporter requires the optional "ioredis" peer dependency. Install it with: npm install ioredis'
            );
        }
    }
}

/** Exposed for RedisClientProxy, which needs the same channel-naming scheme to publish/subscribe correctly. */
export function redisReplyChannel(channelPrefix: string, pattern: string): string {
    return `${channelPrefix}:${pattern}:res:${randomUUID()}`;
}

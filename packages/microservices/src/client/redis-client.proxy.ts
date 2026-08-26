import { randomUUID } from "crypto";
import { ClientProxy } from "./client-proxy";
import { outgoingTrace } from "../context/trace-propagation";
import { RedisTransporterOptions, redisReplyChannel } from "../transports/redis/redis.transporter";

const DEFAULT_TIMEOUT_MS = 10_000;

interface PendingCall {
    resolve: (value: any) => void;
    reject: (reason: unknown) => void;
    timer: ReturnType<typeof setTimeout>;
}

/**
 * Client-side counterpart to RedisTransporter. See redis.transporter.ts for
 * the channel-naming scheme. ioredis reconnects automatically by default
 * (with its own exponential backoff via `retryStrategy`) — this class just
 * needs to not crash the process while that happens and to fail in-flight
 * calls if the connection drops mid-call.
 */
export class RedisClientProxy extends ClientProxy {
    private readonly channelPrefix: string;
    private publisher?: any;
    private subscriber?: any;
    private readonly pending = new Map<string, PendingCall>();

    constructor(private readonly options: RedisTransporterOptions = {}) {
        super();
        this.channelPrefix = options.channelPrefix ?? "nyala:rpc";
    }

    async connect(): Promise<void> {
        if (this.publisher) return;

        const Redis = this.loadIoredis();
        this.publisher = this.createClient(Redis);
        this.subscriber = this.createClient(Redis);

        this.installErrorLogging(this.publisher, "publisher");
        this.installErrorLogging(this.subscriber, "subscriber");

        this.subscriber.on("close", () => {
            this.failAllPending(new Error("Connection to Redis broker closed"));
        });

        this.subscriber.on("message", (_channel: string, raw: string) => {
            const frame = JSON.parse(raw);
            const call = this.pending.get(frame.id);
            if (!call) return;

            this.pending.delete(frame.id);
            clearTimeout(call.timer);

            if (frame.error) {
                const error = new Error(frame.error.message);
                error.name = frame.error.name;
                call.reject(error);
            } else {
                call.resolve(frame.payload);
            }
        });
    }

    async isHealthy(): Promise<boolean> {
        if (!this.publisher) return false;
        try {
            await this.publisher.ping();
            return true;
        } catch {
            return false;
        }
    }

    async close(): Promise<void> {
        await this.publisher?.quit().catch(() => {});
        await this.subscriber?.quit().catch(() => {});
        this.publisher = undefined;
        this.subscriber = undefined;
        this.failAllPending(new Error("Client closed"));
    }

    async send<TResult = any, TPayload = any>(
        pattern: string,
        payload: TPayload,
        timeoutMs = DEFAULT_TIMEOUT_MS
    ): Promise<TResult> {
        await this.connect();

        const id = randomUUID();
        const replyChannel = redisReplyChannel(this.channelPrefix, pattern);

        await this.subscriber.subscribe(replyChannel);

        return new Promise<TResult>((resolve, reject) => {
            const timer = setTimeout(() => {
                this.pending.delete(id);
                this.subscriber.unsubscribe(replyChannel).catch(() => {});
                reject(new Error(`Timed out waiting for reply to "${pattern}" after ${timeoutMs}ms`));
            }, timeoutMs);

            this.pending.set(id, {
                resolve: (value) => {
                    this.subscriber.unsubscribe(replyChannel).catch(() => {});
                    resolve(value);
                },
                reject: (reason) => {
                    this.subscriber.unsubscribe(replyChannel).catch(() => {});
                    reject(reason);
                },
                timer,
            });

            this.publisher
                .publish(
                    `${this.channelPrefix}:${pattern}`,
                    JSON.stringify({ id, payload, replyChannel, trace: outgoingTrace() })
                )
                .catch(reject);
        });
    }

    async emit<TPayload = any>(pattern: string, payload: TPayload): Promise<void> {
        await this.connect();
        await this.publisher.publish(
            `${this.channelPrefix}:${pattern}`,
            JSON.stringify({ id: randomUUID(), payload, trace: outgoingTrace() })
        );
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

    private failAllPending(error: Error): void {
        for (const [id, call] of this.pending) {
            clearTimeout(call.timer);
            call.reject(error);
            this.pending.delete(id);
        }
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
                'RedisClientProxy requires the optional "ioredis" peer dependency. Install it with: npm install ioredis'
            );
        }
    }
}

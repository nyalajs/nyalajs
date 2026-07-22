import { Injectable, Container } from "@nyalajs/core";
import { EventEmitter } from "./event-emitter";
import { EVENT_HANDLER_METADATA } from "./decorators/event-handler";

/**
 * The global EventBus.
 * Wraps EventEmitter and auto-discovers @EventHandler methods from the DI container.
 * Supports Redis pub/sub for distributed event broadcasting.
 */
@Injectable()
export class EventBus {
    private emitter = new EventEmitter();
    private isInitialized = false;
    private redisPub?: any;
    private redisSub?: any;
    private readonly REDIS_CHANNEL = "nyala:events";

    constructor(private readonly container: Container) { }

    /**
     * Emit an event asynchronously. If Redis is configured, broadcasts to all instances.
     */
    emit<T = any>(event: string, payload: T): void {
        this.ensureInitialized();
        if (this.redisPub) {
            this.redisPub.publish(this.REDIS_CHANNEL, JSON.stringify({ event, payload })).catch(console.error);
        } else {
            this.emitter.emit(event, payload);
        }
    }

    /**
     * Emit an event locally and wait for all listeners to finish.
     * (Sync emits are always local, as we cannot await remote processing).
     */
    async emitSync<T = any>(event: string, payload: T): Promise<void> {
        this.ensureInitialized();
        await this.emitter.emitSync(event, payload);
    }

    private setupRedis(): void {
        const redisUrl = process.env.REDIS_URL || process.env.REDIS_HOST;
        if (!redisUrl) return;

        try {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const Redis = require("ioredis");
            const config = process.env.REDIS_URL
                ? process.env.REDIS_URL
                : {
                      host: process.env.REDIS_HOST || "localhost",
                      port: Number(process.env.REDIS_PORT) || 6379,
                      password: process.env.REDIS_PASSWORD,
                  };

            this.redisPub = new Redis(config);
            this.redisSub = new Redis(config);

            this.redisSub.subscribe(this.REDIS_CHANNEL, (err: any) => {
                if (err) console.error("Failed to subscribe to Redis event channel", err);
            });

            this.redisSub.on("message", (channel: string, message: string) => {
                if (channel === this.REDIS_CHANNEL) {
                    try {
                        const { event, payload } = JSON.parse(message);
                        // Emit locally without re-broadcasting
                        this.emitter.emit(event, payload);
                    } catch (e) {
                        console.error("Failed to parse Redis event message", e);
                    }
                }
            });
        } catch (e) {
            console.warn("ioredis is not installed or failed to connect. Falling back to local events.", e);
        }
    }

    /**
     * Lazily scan the container for @EventHandler decorators the first time
     * an event is emitted or when initialized.
     */
    private ensureInitialized(): void {
        if (this.isInitialized) return;

        this.setupRedis();
        const providers = this.container.getProviders();

        for (const [token, provider] of providers.entries()) {
            // We only look at class providers
            if (typeof token !== "function") continue;

            const handlers: Array<{ eventName: string; method: string | symbol }> =
                Reflect.getMetadata(EVENT_HANDLER_METADATA, token) ?? [];

            if (handlers.length === 0) continue;

            // Resolve the instance from the container
            const instance = this.container.resolve<any>(token);

            for (const { eventName, method } of handlers) {
                this.emitter.on(eventName, async (payload) => {
                    await instance[method](payload);
                });
            }
        }

        this.isInitialized = true;
    }
}

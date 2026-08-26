import { Transporter, MessageHandler, EventHandler, IncomingCall } from "../transporter.interface";

export interface NatsTransporterOptions {
    servers: string | string[];
    user?: string;
    pass?: string;
    token?: string;
    /** Prefix applied to every NATS subject, so multiple apps can share one NATS cluster. Defaults to "nyala.rpc". */
    subjectPrefix?: string;
    /** On close(), how long to wait for in-flight handler calls to finish. Defaults to 10s. */
    drainTimeoutMs?: number;
}

interface Envelope {
    payload: any;
    trace: { requestId: string; traceId: string; tenantId?: string };
}

/**
 * Server-side NATS transport. Unlike Redis (plain pub/sub, no native
 * request-reply), NATS has request-reply built in — `nc.subscribe(subject)`
 * + `msg.respond(...)` handles a "message" pattern's reply without needing
 * a manually-created per-call reply channel. "event" patterns are plain
 * pub/sub subjects with no reply expected.
 */
export class NatsTransporter implements Transporter {
    private readonly subjectPrefix: string;
    private readonly messageHandlers = new Map<string, MessageHandler>();
    private readonly eventHandlers = new Map<string, EventHandler>();
    private connection?: any;
    private subscriptions: any[] = [];
    private inFlight = 0;
    private closing = false;

    constructor(private readonly options: NatsTransporterOptions) {
        this.subjectPrefix = options.subjectPrefix ?? "nyala.rpc";
    }

    addMessageHandler(pattern: string, handler: MessageHandler): void {
        this.messageHandlers.set(pattern, handler);
    }

    addEventHandler(pattern: string, handler: EventHandler): void {
        this.eventHandlers.set(pattern, handler);
    }

    async listen(): Promise<void> {
        const { connect, StringCodec } = this.loadNats();
        const codec = StringCodec();

        this.connection = await connect({
            servers: this.options.servers,
            user: this.options.user,
            pass: this.options.pass,
            token: this.options.token,
        });

        this.logConnectionEvents();

        for (const [pattern, handler] of this.messageHandlers) {
            const sub = this.connection.subscribe(this.subject(pattern));
            this.subscriptions.push(sub);
            this.consumeMessages(sub, codec, pattern, handler, "message");
        }

        for (const [pattern, handler] of this.eventHandlers) {
            const sub = this.connection.subscribe(this.subject(pattern));
            this.subscriptions.push(sub);
            this.consumeMessages(sub, codec, pattern, handler as any, "event");
        }
    }

    async isHealthy(): Promise<boolean> {
        return !!this.connection && !this.connection.isClosed() && !this.closing;
    }

    /**
     * Unsubscribes from every subject immediately (stops new calls being
     * delivered), waits (up to drainTimeoutMs) for in-flight handler calls
     * to finish, then drains and closes the connection.
     */
    async close(): Promise<void> {
        if (!this.connection) return;
        this.closing = true;

        for (const sub of this.subscriptions) {
            sub.unsubscribe();
        }

        const drainTimeoutMs = this.options.drainTimeoutMs ?? 10_000;
        const deadline = Date.now() + drainTimeoutMs;
        while (this.inFlight > 0 && Date.now() < deadline) {
            await new Promise((resolve) => setTimeout(resolve, 25));
        }

        await this.connection.drain();
    }

    private async consumeMessages(
        sub: any,
        codec: any,
        pattern: string,
        handler: MessageHandler | EventHandler,
        kind: "message" | "event"
    ): Promise<void> {
        for await (const msg of sub) {
            if (this.closing) continue;

            let envelope: Envelope;
            try {
                envelope = JSON.parse(codec.decode(msg.data));
            } catch {
                continue;
            }

            const call: IncomingCall = { payload: envelope.payload, trace: envelope.trace };

            this.inFlight++;
            if (kind === "message") {
                try {
                    const result = await (handler as MessageHandler)(call);
                    msg.respond(codec.encode(JSON.stringify({ payload: result, error: null })));
                } catch (error) {
                    msg.respond(
                        codec.encode(
                            JSON.stringify({
                                payload: undefined,
                                error: { message: (error as Error).message, name: (error as Error).name },
                            })
                        )
                    );
                } finally {
                    this.inFlight--;
                }
            } else {
                try {
                    await (handler as EventHandler)(call);
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
    }

    private logConnectionEvents(): void {
        (async () => {
            for await (const status of this.connection.status()) {
                if (status.type === "error" || status.type === "disconnect") {
                    console.error(
                        JSON.stringify({ level: "error", message: `NATS connection ${status.type}`, data: String(status.data ?? "") })
                    );
                }
            }
        })().catch(() => {});
    }

    private subject(pattern: string): string {
        return `${this.subjectPrefix}.${pattern}`;
    }

    private loadNats(): any {
        try {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            return require("nats");
        } catch {
            throw new Error(
                'NatsTransporter requires the optional "nats" peer dependency. Install it with: npm install nats'
            );
        }
    }
}

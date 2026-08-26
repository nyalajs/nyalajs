import { Socket, connect } from "net";
import { ClientProxy } from "./client-proxy";
import { outgoingTrace } from "../context/trace-propagation";
import {
    FrameDecoder,
    WireFrame,
    createAuthFrame,
    createEventFrame,
    createRequestFrame,
    encodeFrame,
} from "../transports/wire-protocol";

export interface TcpClientOptions {
    port: number;
    host?: string;
    /** Sent as the first frame's payload on connect; must match TcpTransporterOptions.authToken on the server. */
    authToken?: string;
    /**
     * Reconnection backoff after the connection drops. Disabled by setting
     * `maxRetries: 0`. Defaults to exponential backoff starting at 200ms,
     * doubling up to 10s, retrying indefinitely (maxRetries: -1 means
     * "forever", matching how a database driver would behave — a
     * microservice client outliving a brief restart of its peer is the
     * common case, not the exception).
     */
    reconnect?: {
        initialDelayMs?: number;
        maxDelayMs?: number;
        maxRetries?: number;
    };
}

interface PendingCall {
    resolve: (value: any) => void;
    reject: (reason: unknown) => void;
    timer: ReturnType<typeof setTimeout>;
}

const DEFAULT_TIMEOUT_MS = 10_000;

/** Client-side counterpart to TcpTransporter — connects once, multiplexes calls over one socket, reconnects with backoff on drop. */
export class TcpClientProxy extends ClientProxy {
    private socket?: Socket;
    private connecting?: Promise<void>;
    private readonly decoder = new FrameDecoder();
    private readonly pending = new Map<string, PendingCall>();
    private closedByUser = false;
    private reconnectAttempts = 0;

    constructor(private readonly options: TcpClientOptions) {
        super();
    }

    async connect(): Promise<void> {
        if (this.socket) return;
        if (this.connecting) return this.connecting;

        this.connecting = this.openSocket().finally(() => {
            this.connecting = undefined;
        });

        return this.connecting;
    }

    private openSocket(): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            const socket = connect(this.options.port, this.options.host ?? "127.0.0.1");

            socket.once("connect", () => {
                socket.removeListener("error", reject);
                this.socket = socket;
                this.reconnectAttempts = 0;

                if (this.options.authToken) {
                    socket.write(encodeFrame(createAuthFrame(this.options.authToken)));
                }

                resolve();
            });

            socket.once("error", reject);

            socket.on("data", (chunk) => this.handleData(chunk.toString("utf8")));

            socket.on("close", () => {
                this.socket = undefined;
                this.failAllPending(new Error("Connection to microservice closed"));
                if (!this.closedByUser) {
                    this.scheduleReconnect();
                }
            });
        });
    }

    private scheduleReconnect(): void {
        const config = this.options.reconnect ?? {};
        const maxRetries = config.maxRetries ?? -1;

        if (maxRetries >= 0 && this.reconnectAttempts >= maxRetries) return;

        const initialDelayMs = config.initialDelayMs ?? 200;
        const maxDelayMs = config.maxDelayMs ?? 10_000;
        const delay = Math.min(initialDelayMs * 2 ** this.reconnectAttempts, maxDelayMs);

        this.reconnectAttempts++;

        setTimeout(() => {
            if (this.closedByUser) return;
            this.connect().catch(() => {
                // openSocket()'s own "close" handler already re-schedules the next attempt.
            });
        }, delay);
    }

    async close(): Promise<void> {
        this.closedByUser = true;
        if (!this.socket) return;
        await new Promise<void>((resolve) => this.socket!.end(() => resolve()));
        this.socket = undefined;
        this.failAllPending(new Error("Client closed"));
    }

    async isHealthy(): Promise<boolean> {
        return !!this.socket && !this.socket.destroyed;
    }

    async send<TResult = any, TPayload = any>(
        pattern: string,
        payload: TPayload,
        timeoutMs = DEFAULT_TIMEOUT_MS
    ): Promise<TResult> {
        await this.connect();

        const frame = createRequestFrame(pattern, payload, outgoingTrace());

        return new Promise<TResult>((resolve, reject) => {
            const timer = setTimeout(() => {
                this.pending.delete(frame.id);
                reject(new Error(`Timed out waiting for reply to "${pattern}" after ${timeoutMs}ms`));
            }, timeoutMs);

            this.pending.set(frame.id, { resolve, reject, timer });
            this.socket!.write(encodeFrame(frame));
        });
    }

    async emit<TPayload = any>(pattern: string, payload: TPayload): Promise<void> {
        await this.connect();
        this.socket!.write(encodeFrame(createEventFrame(pattern, payload, outgoingTrace())));
    }

    private handleData(chunk: string): void {
        let frames: WireFrame[];
        try {
            frames = this.decoder.feed(chunk);
        } catch {
            return;
        }

        for (const frame of frames) {
            if (frame.kind !== "response") continue;

            const call = this.pending.get(frame.id);
            if (!call) continue;

            this.pending.delete(frame.id);
            clearTimeout(call.timer);

            if (frame.error) {
                const error = new Error(frame.error.message);
                error.name = frame.error.name;
                call.reject(error);
            } else {
                call.resolve(frame.payload);
            }
        }
    }

    private failAllPending(error: Error): void {
        for (const [id, call] of this.pending) {
            clearTimeout(call.timer);
            call.reject(error);
            this.pending.delete(id);
        }
    }
}

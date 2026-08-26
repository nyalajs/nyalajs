import { createServer, Server, Socket } from "net";
import { Transporter, MessageHandler, EventHandler, IncomingCall } from "../transporter.interface";
import { FrameDecoder, WireFrame, createResponseFrame, encodeFrame } from "../wire-protocol";

export interface TcpTransporterOptions {
    port: number;
    host?: string;
    /**
     * Shared secret required in the first frame's `payload` on connect (see
     * TcpClientOptions.authToken). No auth is enforced when unset — TCP has
     * no built-in transport-level encryption or identity, so treat an
     * unauthenticated microservice port the same as an unauthenticated
     * database port: fine on a private network/service mesh, not fine
     * exposed publicly.
     */
    authToken?: string;
    /** Maximum concurrent client connections. Extra connections are refused immediately. Defaults to 1000. */
    maxConnections?: number;
    /**
     * On close(), how long to wait for in-flight handler calls on each
     * connection to finish before forcibly destroying the socket. Defaults
     * to 10s, matching a typical container orchestrator's shutdown grace
     * period.
     */
    drainTimeoutMs?: number;
}

/**
 * Server-side TCP transport. Listens for newline-delimited JSON frames
 * (see wire-protocol.ts), dispatches "message" frames to the registered
 * @MessagePattern handler and writes back a "response" frame, and dispatches
 * "event" frames to the registered @EventPattern handler with no reply.
 */
export class TcpTransporter implements Transporter {
    private server?: Server;
    private readonly messageHandlers = new Map<string, MessageHandler>();
    private readonly eventHandlers = new Map<string, EventHandler>();
    private readonly sockets = new Set<Socket>();
    private inFlight = 0;
    private closing = false;

    constructor(private readonly options: TcpTransporterOptions) {}

    addMessageHandler(pattern: string, handler: MessageHandler): void {
        this.messageHandlers.set(pattern, handler);
    }

    addEventHandler(pattern: string, handler: EventHandler): void {
        this.eventHandlers.set(pattern, handler);
    }

    async listen(): Promise<void> {
        this.server = createServer((socket) => this.handleConnection(socket));

        this.server.on("error", (error) => {
            console.error(
                JSON.stringify({ level: "error", message: "TCP transport server error", error: (error as Error).message })
            );
        });

        await new Promise<void>((resolve, reject) => {
            this.server!.once("error", reject);
            this.server!.listen(this.options.port, this.options.host ?? "0.0.0.0", () => {
                this.server!.removeListener("error", reject);
                resolve();
            });
        });
    }

    async isHealthy(): Promise<boolean> {
        return !!this.server?.listening && !this.closing;
    }

    /**
     * Stops accepting new connections immediately, then waits (up to
     * `drainTimeoutMs`) for handler calls already in flight to finish before
     * destroying remaining sockets — a request that arrived a moment before
     * shutdown still gets its reply instead of a dropped connection.
     *
     * `server.close()`'s own callback only fires once every existing
     * connection has ended (Node's documented behavior) — since a
     * long-lived client keeps its socket open indefinitely between calls,
     * awaiting that callback before destroying sockets would hang forever
     * instead of draining. So `server.close()` here is deliberately not
     * awaited: calling it stops new connections immediately, and the drain
     * loop below is what actually waits for in-flight work before this
     * method destroys the remaining idle sockets itself (which in turn lets
     * server.close()'s callback fire, harmlessly, on its own time).
     */
    async close(): Promise<void> {
        if (!this.server) return;
        this.closing = true;
        this.server.close();

        const drainTimeoutMs = this.options.drainTimeoutMs ?? 10_000;
        const deadline = Date.now() + drainTimeoutMs;

        while (this.inFlight > 0 && Date.now() < deadline) {
            await new Promise((resolve) => setTimeout(resolve, 25));
        }

        for (const socket of this.sockets) {
            socket.destroy();
        }
        this.sockets.clear();
    }

    private handleConnection(socket: Socket): void {
        if (this.closing) {
            socket.destroy();
            return;
        }

        const maxConnections = this.options.maxConnections ?? 1000;
        if (this.sockets.size >= maxConnections) {
            socket.destroy();
            return;
        }

        this.sockets.add(socket);
        socket.on("close", () => this.sockets.delete(socket));

        let authenticated = !this.options.authToken;
        const decoder = new FrameDecoder();

        socket.on("data", (chunk) => {
            let frames: WireFrame[];
            try {
                frames = decoder.feed(chunk.toString("utf8"));
            } catch {
                // Malformed frame: drop the connection rather than desync the stream.
                socket.destroy();
                return;
            }

            for (const frame of frames) {
                if (!authenticated) {
                    if (frame.kind !== "auth" || frame.payload?.token !== this.options.authToken) {
                        socket.destroy();
                        return;
                    }
                    authenticated = true;
                    continue;
                }

                if (frame.kind === "auth") continue;

                this.dispatch(frame, socket).catch(() => {
                    // dispatch() already turns handler errors into response
                    // frames for "message" kind; anything reaching here is
                    // an unexpected transport-level failure — drop it rather
                    // than crash the connection loop for other sockets.
                });
            }
        });
    }

    private async dispatch(frame: WireFrame, socket: Socket): Promise<void> {
        if (this.closing) return;

        const call: IncomingCall = {
            payload: frame.payload,
            trace: frame.trace ?? { requestId: frame.id, traceId: frame.id },
        };

        if (frame.kind === "message") {
            const handler = frame.pattern ? this.messageHandlers.get(frame.pattern) : undefined;

            if (!handler) {
                const error = new Error(`No @MessagePattern handler registered for "${frame.pattern}"`);
                socket.write(encodeFrame(createResponseFrame(frame.id, undefined, error)));
                return;
            }

            this.inFlight++;
            try {
                const result = await handler(call);
                socket.write(encodeFrame(createResponseFrame(frame.id, result)));
            } catch (error) {
                socket.write(encodeFrame(createResponseFrame(frame.id, undefined, error as Error)));
            } finally {
                this.inFlight--;
            }
            return;
        }

        if (frame.kind === "event") {
            const handler = frame.pattern ? this.eventHandlers.get(frame.pattern) : undefined;
            if (!handler) return;

            this.inFlight++;
            try {
                await handler(call);
            } catch (error) {
                console.error(
                    JSON.stringify({
                        level: "error",
                        message: "Unhandled @EventPattern handler error",
                        pattern: frame.pattern,
                        error: (error as Error).message,
                    })
                );
            } finally {
                this.inFlight--;
            }
        }
    }
}

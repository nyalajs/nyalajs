import { Readable } from "stream";
import { StreamableResponse } from "./streamable.interface";

export interface SseMessage {
    /** Maps to the browser EventSource's `event` name; omit for a plain "message" event. */
    event?: string;
    data: any;
    /** Sets Last-Event-ID for reconnection — the browser resends this in the Last-Event-ID header if the connection drops and it reconnects. */
    id?: string;
    /** Reconnection delay in ms, sent as the `retry:` field. Only needs setting once, typically on the first message. */
    retry?: number;
}

/**
 * A text/event-stream response a handler builds incrementally and returns.
 * Implements StreamableResponse (it wraps a Readable), so the adapter needs
 * no SSE-specific branch — encoding the wire format is this class's job.
 *
 * @example
 *   @Get("/progress")
 *   trackProgress() {
 *     const sse = new SseStream();
 *     const job = startJob();
 *     job.on("progress", (pct) => sse.send({ event: "progress", data: { pct } }));
 *     job.on("done", (result) => { sse.send({ event: "done", data: result }); sse.close(); });
 *     return sse;
 *   }
 */
export class SseStream implements StreamableResponse {
    readonly stream: Readable;
    readonly contentType = "text/event-stream";
    readonly statusCode = 200;
    readonly headers: Record<string, string>;

    private push: (chunk: string) => void = () => {};
    private closed = false;

    constructor(options: { heartbeatMs?: number } = {}) {
        this.headers = {
            "Cache-Control": "no-cache, no-transform",
            Connection: "keep-alive",
            // Nginx and similar proxies buffer responses by default, which
            // defeats SSE entirely (the client gets nothing until the
            // buffer fills or the stream ends) — this header disables that.
            "X-Accel-Buffering": "no",
        };

        this.stream = new Readable({
            read() {
                /* no-op: this is a push stream — send()/close() drive it, not read() pulls */
            },
        });

        this.push = (chunk: string) => this.stream.push(chunk);

        if (options.heartbeatMs) {
            const timer = setInterval(() => {
                if (this.closed) {
                    clearInterval(timer);
                    return;
                }
                // A comment line (": ...") is valid SSE, ignored by
                // EventSource, and keeps intermediary proxies/load balancers
                // from timing out an otherwise-idle connection.
                this.push(": heartbeat\n\n");
            }, options.heartbeatMs);
            this.stream.once("close", () => clearInterval(timer));
        }
    }

    /** Sends one SSE event. No-ops silently if the stream is already closed (matches EventSource semantics: nothing to reconnect to). */
    send(message: SseMessage): void {
        if (this.closed) return;

        let frame = "";
        if (message.id !== undefined) frame += `id: ${message.id}\n`;
        if (message.retry !== undefined) frame += `retry: ${message.retry}\n`;
        if (message.event) frame += `event: ${message.event}\n`;

        const payload = typeof message.data === "string" ? message.data : JSON.stringify(message.data);
        // Multi-line payloads need one "data:" prefix per line per the SSE spec.
        for (const line of payload.split("\n")) {
            frame += `data: ${line}\n`;
        }
        frame += "\n";

        this.push(frame);
    }

    /** Ends the stream — the client's EventSource will attempt to reconnect unless the server also closes the underlying connection (which the adapter does once the stream ends). */
    close(): void {
        if (this.closed) return;
        this.closed = true;
        this.stream.push(null);
    }

    /** True once close() has been called (or the underlying connection was dropped by the client — see the adapter's "close" wiring). */
    isClosed(): boolean {
        return this.closed;
    }
}

import { Readable } from "stream";

/**
 * A response whose body is produced incrementally instead of built up front
 * — the streaming counterpart to RenderableResponse. `@nyalajs/http` never
 * imports anything content-specific; a handler returns one of these and the
 * adapter pipes it to the raw response, setting headers appropriately.
 *
 * Two shapes are supported: `SseStream` (event-framed, for live/incremental
 * updates a browser reads with EventSource or a manual fetch reader) and a
 * raw `StreamableResponse` (any Readable — file downloads, proxied bodies,
 * anything that isn't SSE-framed).
 */
export interface StreamableResponse {
    stream: Readable;
    /** Defaults to "application/octet-stream" if omitted. */
    contentType?: string;
    /** Defaults to 200 if omitted. */
    statusCode?: number;
    /** Extra response headers (e.g. Content-Disposition for a download, Content-Length if known). */
    headers?: Record<string, string>;
}

export function isStreamable(value: any): value is StreamableResponse {
    return value != null && value.stream instanceof Readable;
}

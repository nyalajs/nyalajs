import { randomUUID } from "crypto";
import { TracePropagation } from "../context/trace-propagation";

/**
 * Every frame exchanged over the TCP transport, in both directions.
 *
 * - "message": request-response call, expects exactly one "response" frame back.
 * - "event": fire-and-forget, no response frame is sent.
 * - "response": reply to a previous "message" frame, correlated by `id`.
 */
export interface WireFrame {
    id: string;
    kind: "message" | "event" | "response" | "auth";
    pattern?: string;
    payload?: any;
    trace?: TracePropagation;
    error?: { message: string; name: string } | null;
}

export function createAuthFrame(token: string): WireFrame {
    return { id: "auth", kind: "auth", payload: { token } };
}

export function createRequestFrame(pattern: string, payload: any, trace: TracePropagation): WireFrame {
    return { id: randomUUID(), kind: "message", pattern, payload, trace };
}

export function createEventFrame(pattern: string, payload: any, trace: TracePropagation): WireFrame {
    return { id: randomUUID(), kind: "event", pattern, payload, trace };
}

export function createResponseFrame(id: string, payload: any, error?: Error): WireFrame {
    return {
        id,
        kind: "response",
        payload: error ? undefined : payload,
        error: error ? { message: error.message, name: error.name } : null,
    };
}

/**
 * Frames are newline-delimited JSON over the TCP stream. `feed()` appends
 * newly-received bytes and returns any frames that are now complete —
 * a stream socket can deliver a frame split across several `data` events,
 * or several frames coalesced into one, so this buffers between calls.
 */
export class FrameDecoder {
    private buffer = "";

    feed(chunk: string): WireFrame[] {
        this.buffer += chunk;
        const frames: WireFrame[] = [];

        let newlineIndex: number;
        while ((newlineIndex = this.buffer.indexOf("\n")) !== -1) {
            const line = this.buffer.slice(0, newlineIndex);
            this.buffer = this.buffer.slice(newlineIndex + 1);

            if (line.length === 0) continue;
            frames.push(JSON.parse(line));
        }

        return frames;
    }
}

export function encodeFrame(frame: WireFrame): string {
    return JSON.stringify(frame) + "\n";
}

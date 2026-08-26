/**
 * Wire format for every frame sent in either direction over a gateway
 * connection: `{"event": "<name>", "data": <payload>}` as a single JSON text
 * frame. Simpler than @nyalajs/microservices' wire-protocol.ts (no
 * request/response correlation id) because WebSocket connections are
 * bidirectional streams, not RPC — a client emits events, the gateway emits
 * events back; there's no built-in notion of "the reply to this specific
 * message" the way a microservice @MessagePattern call has one.
 */
export interface WsFrame {
    event: string;
    data?: any;
}

export function encodeWsFrame(frame: WsFrame): string {
    return JSON.stringify(frame);
}

export function decodeWsFrame(raw: string): WsFrame {
    const parsed = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || typeof parsed.event !== "string") {
        throw new Error('Malformed WebSocket frame: expected {"event": string, "data"?: any}');
    }
    return parsed;
}

/**
 * Wire format for a *binary* frame (`ws` reports these separately via its
 * `isBinary` flag on the "message" event — the underlying WebSocket
 * protocol has native text vs. binary frame types, so no JSON envelope is
 * needed to tell them apart the way HTTP needs Content-Type). Still routed
 * to a named handler the same way text frames are, via a small length-
 * prefixed header: `[1 byte: event name length][event name, utf8][raw payload bytes]`.
 * This lets one gateway mix @SubscribeMessage (JSON) and @BinaryMessage
 * (raw bytes) handlers on the same connection — e.g. JSON control messages
 * plus a binary handler for uploaded audio/video chunks.
 */
export interface WsBinaryFrame {
    event: string;
    payload: Buffer;
}

export function encodeWsBinaryFrame(frame: WsBinaryFrame): Buffer {
    const eventBytes = Buffer.from(frame.event, "utf8");
    if (eventBytes.length > 255) {
        throw new Error(`Binary WS event name too long (max 255 bytes utf8): "${frame.event}"`);
    }
    return Buffer.concat([Buffer.from([eventBytes.length]), eventBytes, frame.payload]);
}

export function decodeWsBinaryFrame(raw: Buffer): WsBinaryFrame {
    if (raw.length < 1) {
        throw new Error("Malformed binary WS frame: empty");
    }
    const eventLength = raw[0];
    if (raw.length < 1 + eventLength) {
        throw new Error("Malformed binary WS frame: truncated event name");
    }
    const event = raw.subarray(1, 1 + eventLength).toString("utf8");
    const payload = raw.subarray(1 + eventLength);
    return { event, payload };
}

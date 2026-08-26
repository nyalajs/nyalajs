import { randomUUID } from "crypto";
import { encodeWsFrame, encodeWsBinaryFrame } from "./ws-protocol";
import { RoomRegistry } from "./room-registry";

/**
 * Per-connection handle passed to gateway handlers (via @ConnectedSocket())
 * and returned from broadcast/room lookups. Wraps the raw `ws` WebSocket
 * with the send-a-named-event API gateways actually want, plus room
 * membership — the real-time equivalent of ExecutionContext/RequestContext
 * for HTTP.
 */
export class NyalaSocket {
    readonly id: string = randomUUID();
    /** Arbitrary per-connection state a gateway can attach in @OnConnect() (e.g. authenticated userId/tenantId). */
    readonly data: Record<string, any> = {};

    constructor(
        private readonly raw: import("ws").WebSocket,
        private readonly rooms: RoomRegistry
    ) {}

    /** Sends one named event to this connection only. */
    emit(event: string, data?: any): void {
        if (this.raw.readyState !== this.raw.OPEN) return;
        this.raw.send(encodeWsFrame({ event, data }));
    }

    /**
     * Sends one named event with a raw binary payload — the counterpart to
     * emit() for a @BinaryMessage()-style event, delivered as a real
     * WebSocket binary frame (not base64-in-JSON, which would cost ~33%
     * extra bytes for no benefit once both ends already speak binary).
     */
    emitBinary(event: string, payload: Buffer): void {
        if (this.raw.readyState !== this.raw.OPEN) return;
        this.raw.send(encodeWsBinaryFrame({ event, payload }));
    }

    /** Sends one named event to every other connection in `room` (not to this socket itself). */
    broadcast(room: string, event: string, data?: any): void {
        for (const member of this.rooms.membersOf(room)) {
            if (member === this) continue;
            member.emit(event, data);
        }
    }

    /** Binary counterpart to broadcast() — sends a raw payload to every other connection in `room`. */
    broadcastBinary(room: string, event: string, payload: Buffer): void {
        for (const member of this.rooms.membersOf(room)) {
            if (member === this) continue;
            member.emitBinary(event, payload);
        }
    }

    join(room: string): void {
        this.rooms.join(room, this);
    }

    leave(room: string): void {
        this.rooms.leave(room, this);
    }

    /** Rooms this socket currently belongs to. */
    currentRooms(): string[] {
        return this.rooms.roomsOf(this);
    }

    close(code?: number, reason?: string): void {
        this.raw.close(code, reason);
    }
}

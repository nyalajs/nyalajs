import { NyalaSocket } from "./nyala-socket";

/**
 * Tracks which sockets belong to which rooms, scoped to one gateway (each
 * @WebSocketGateway() gets its own registry — rooms don't leak across
 * gateways on different paths). A socket can be in any number of rooms;
 * rooms are created implicitly on first join and cleaned up when empty.
 */
export class RoomRegistry {
    private readonly rooms = new Map<string, Set<NyalaSocket>>();

    join(room: string, socket: NyalaSocket): void {
        let members = this.rooms.get(room);
        if (!members) {
            members = new Set();
            this.rooms.set(room, members);
        }
        members.add(socket);
    }

    leave(room: string, socket: NyalaSocket): void {
        const members = this.rooms.get(room);
        if (!members) return;
        members.delete(socket);
        if (members.size === 0) this.rooms.delete(room);
    }

    /** Removes a socket from every room it was in — called on disconnect. */
    leaveAll(socket: NyalaSocket): void {
        for (const room of [...this.rooms.keys()]) {
            this.leave(room, socket);
        }
    }

    membersOf(room: string): NyalaSocket[] {
        return [...(this.rooms.get(room) ?? [])];
    }

    roomsOf(socket: NyalaSocket): string[] {
        const result: string[] = [];
        for (const [room, members] of this.rooms) {
            if (members.has(socket)) result.push(room);
        }
        return result;
    }
}

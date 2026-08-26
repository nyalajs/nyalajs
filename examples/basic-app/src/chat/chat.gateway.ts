import {
    WebSocketGateway,
    SubscribeMessage,
    MessageBody,
    ConnectedSocket,
    OnConnect,
    OnDisconnect,
    NyalaSocket,
} from "@nyalajs/http";

const GENERAL_ROOM = "general";

/**
 * A minimal real-time chat room. Every connection auto-joins "general";
 * `chat.message` broadcasts to everyone else in it. Try it with a plain
 * WebSocket client:
 *
 *   const ws = new WebSocket("ws://localhost:3000/ws/chat");
 *   ws.onmessage = (e) => console.log(JSON.parse(e.data));
 *   ws.onopen = () => ws.send(JSON.stringify({
 *     event: "chat.message",
 *     data: { text: "hello!" },
 *   }));
 */
@WebSocketGateway({ path: "/ws/chat" })
export class ChatGateway {
    @OnConnect()
    onConnect(@ConnectedSocket() socket: NyalaSocket) {
        socket.join(GENERAL_ROOM);
        socket.emit("chat.joined", { room: GENERAL_ROOM, id: socket.id });
    }

    @OnDisconnect()
    onDisconnect(@ConnectedSocket() socket: NyalaSocket) {
        // socket.leave() isn't strictly needed here — RoomRegistry already
        // removes a disconnected socket from every room it was in — but
        // shown for the case a handler wants to leave a room explicitly
        // while still connected (e.g. switching rooms).
        socket.leave(GENERAL_ROOM);
    }

    @SubscribeMessage("chat.message")
    onMessage(@MessageBody() body: { text: string }, @ConnectedSocket() socket: NyalaSocket) {
        socket.broadcast(GENERAL_ROOM, "chat.message", {
            from: socket.id,
            text: body.text,
        });
    }
}

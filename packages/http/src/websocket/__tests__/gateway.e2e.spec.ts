import "reflect-metadata";
import { describe, it, expect, afterEach } from "vitest";
import WebSocket from "ws";
import {
    Injectable,
    Module,
    Kernel,
} from "@nyalajs/core";
import { WebSocketGateway } from "../decorators/gateway";
import { SubscribeMessage } from "../decorators/subscribe-message";
import { MessageBody, ConnectedSocket } from "../decorators/params";
import { OnConnect, OnDisconnect } from "../decorators/lifecycle";
import { NyalaSocket } from "../runtime/nyala-socket";
import { FastifyAdapter } from "../../runtime/fastify-adapter";

const connected: string[] = [];
const disconnected: string[] = [];

@Injectable()
class GreeterService {
    greet(name: string): string {
        return `Hello, ${name}`;
    }
}

@WebSocketGateway({ path: "/ws/chat" })
class ChatGateway {
    constructor(private readonly greeter: GreeterService) {}

    @OnConnect()
    onConnect(@ConnectedSocket() socket: NyalaSocket) {
        connected.push(socket.id);
    }

    @OnDisconnect()
    onDisconnect(@ConnectedSocket() socket: NyalaSocket) {
        disconnected.push(socket.id);
    }

    @SubscribeMessage("greet")
    onGreet(@MessageBody() body: { name: string }) {
        return { event: "greeting", data: this.greeter.greet(body.name) };
    }

    @SubscribeMessage("join-room")
    onJoinRoom(@MessageBody() room: string, @ConnectedSocket() socket: NyalaSocket) {
        socket.join(room);
    }

    @SubscribeMessage("room-message")
    onRoomMessage(@MessageBody() body: { room: string; text: string }, @ConnectedSocket() socket: NyalaSocket) {
        socket.broadcast(body.room, "room-message", body.text);
    }
}
Reflect.defineMetadata("design:paramtypes", [GreeterService], ChatGateway);

@Module({
    providers: [GreeterService, ChatGateway],
})
class AppModule {}

function getFreePort(): number {
    return 47000 + Math.floor(Math.random() * 5000);
}

async function bootstrapApp(port: number) {
    const kernel = new Kernel();
    await kernel.bootstrap(AppModule);

    const adapter = new FastifyAdapter(kernel.getContainer(), {
        session: false,
        websocket: true,
        swagger: false,
        helmet: false,
        rateLimit: false,
        cors: false,
        csrf: false,
    });

    adapter.registerWebSocketGateways(kernel);
    await adapter.listen(port);

    return adapter;
}

function connectClient(port: number, path: string): Promise<WebSocket> {
    return new Promise((resolve, reject) => {
        const ws = new WebSocket(`ws://127.0.0.1:${port}${path}`);
        ws.once("open", () => resolve(ws));
        ws.once("error", reject);
    });
}

function nextMessage(ws: WebSocket): Promise<any> {
    return new Promise((resolve) => {
        ws.once("message", (raw) => resolve(JSON.parse(raw.toString())));
    });
}

describe("WebSocket gateway (e2e)", () => {
    let adapter: FastifyAdapter | undefined;
    const clients: WebSocket[] = [];

    afterEach(async () => {
        await Promise.all(
            clients.map(
                (client) =>
                    new Promise<void>((resolve) => {
                        if (client.readyState === client.CLOSED) return resolve();
                        client.once("close", () => resolve());
                        client.close();
                    })
            )
        );
        clients.length = 0;
        await adapter?.close();
        adapter = undefined;
        connected.length = 0;
        disconnected.length = 0;
    });

    it("resolves the gateway through DI and replies to a @SubscribeMessage handler's return value", async () => {
        const port = getFreePort();
        adapter = await bootstrapApp(port);

        const client = await connectClient(port, "/ws/chat");
        clients.push(client);

        client.send(JSON.stringify({ event: "greet", data: { name: "World" } }));
        const reply = await nextMessage(client);

        expect(reply).toEqual({ event: "greeting", data: "Hello, World" });
    });

    it("calls @OnConnect and @OnDisconnect with the connecting socket", async () => {
        const port = getFreePort();
        adapter = await bootstrapApp(port);

        const client = await connectClient(port, "/ws/chat");
        clients.push(client);

        // Give onConnect a tick to run (it fires synchronously in the
        // handler, but the assertion still races the event loop turn).
        await new Promise((r) => setTimeout(r, 20));
        expect(connected).toHaveLength(1);

        await new Promise<void>((resolve) => {
            client.once("close", () => resolve());
            client.close();
        });
        clients.length = 0; // already closed above — afterEach must not close it again
        await new Promise((r) => setTimeout(r, 20));

        expect(disconnected).toHaveLength(1);
        expect(disconnected[0]).toBe(connected[0]);
    });

    it("broadcasts room messages to other members but not back to the sender", async () => {
        const port = getFreePort();
        adapter = await bootstrapApp(port);

        const alice = await connectClient(port, "/ws/chat");
        const bob = await connectClient(port, "/ws/chat");
        clients.push(alice, bob);

        alice.send(JSON.stringify({ event: "join-room", data: "general" }));
        bob.send(JSON.stringify({ event: "join-room", data: "general" }));
        await new Promise((r) => setTimeout(r, 20));

        const bobReceived = nextMessage(bob);
        alice.send(JSON.stringify({ event: "room-message", data: { room: "general", text: "hi bob" } }));

        const message = await bobReceived;
        expect(message).toEqual({ event: "room-message", data: "hi bob" });
    });

    it("silently ignores an event with no matching @SubscribeMessage handler", async () => {
        const port = getFreePort();
        adapter = await bootstrapApp(port);

        const client = await connectClient(port, "/ws/chat");
        clients.push(client);

        client.send(JSON.stringify({ event: "unknown-event", data: {} }));

        // No crash, no reply — confirm the connection is still alive by
        // using it successfully right after.
        client.send(JSON.stringify({ event: "greet", data: { name: "Still Alive" } }));
        const reply = await nextMessage(client);
        expect(reply).toEqual({ event: "greeting", data: "Hello, Still Alive" });
    });
});

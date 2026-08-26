import "reflect-metadata";
import { describe, it, expect, afterEach } from "vitest";
import WebSocket from "ws";
import { Injectable, Module, Kernel } from "@nyalajs/core";
import { WebSocketGateway } from "../decorators/gateway";
import { SubscribeMessage, BinaryMessage } from "../decorators/subscribe-message";
import { MessageBody, ConnectedSocket } from "../decorators/params";
import { NyalaSocket } from "../runtime/nyala-socket";
import { FastifyAdapter } from "../../runtime/fastify-adapter";
import { encodeWsBinaryFrame } from "../runtime/ws-protocol";

const receivedChunks: Buffer[] = [];

@Injectable()
class TranscoderService {
    // Pretend this does real work (e.g. feeding an audio chunk to a transcriber).
    reverse(chunk: Buffer): Buffer {
        return Buffer.from([...chunk].reverse());
    }
}

@WebSocketGateway({ path: "/ws/media" })
class MediaGateway {
    constructor(private readonly transcoder: TranscoderService) {}

    @BinaryMessage("audio-chunk")
    onAudioChunk(@MessageBody() chunk: Buffer) {
        receivedChunks.push(chunk);
        // Reply with a transformed Buffer — exercises the "handler returns
        // a Buffer" reply-to-sender convenience path.
        return this.transcoder.reverse(chunk);
    }

    @SubscribeMessage("ping")
    onPing() {
        return { event: "pong", data: null };
    }
}
Reflect.defineMetadata("design:paramtypes", [TranscoderService], MediaGateway);

@Module({ providers: [TranscoderService, MediaGateway] })
class AppModule {}

function getFreePort(): number {
    return 59000 + Math.floor(Math.random() * 5000);
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

describe("WebSocket gateway — binary frames (e2e)", () => {
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
        receivedChunks.length = 0;
    });

    it("routes a real binary WebSocket frame to @BinaryMessage(), delivering a genuine Buffer, not JSON", async () => {
        const port = getFreePort();
        adapter = await bootstrapApp(port);

        const client = await connectClient(port, "/ws/media");
        clients.push(client);

        const audioBytes = Buffer.from([0x01, 0x02, 0x03, 0xff, 0xfe]);
        const frame = encodeWsBinaryFrame({ event: "audio-chunk", payload: audioBytes });

        const replyPromise = new Promise<{ raw: Buffer; isBinary: boolean }>((resolve) => {
            client.once("message", (raw, isBinary) => resolve({ raw: raw as Buffer, isBinary }));
        });

        client.send(frame, { binary: true });

        const reply = await replyPromise;

        expect(receivedChunks).toHaveLength(1);
        expect(receivedChunks[0]).toEqual(audioBytes);

        // The reply itself must also be a genuine binary WS frame.
        expect(reply.isBinary).toBe(true);
        const decoded = decodeReply(reply.raw);
        expect(decoded.payload).toEqual(Buffer.from([...audioBytes].reverse()));
    });

    it("a gateway can mix @SubscribeMessage (JSON/text) and @BinaryMessage (binary) on the same connection", async () => {
        const port = getFreePort();
        adapter = await bootstrapApp(port);

        const client = await connectClient(port, "/ws/media");
        clients.push(client);

        const pongPromise = new Promise<any>((resolve) => {
            client.once("message", (raw) => resolve(JSON.parse(raw.toString())));
        });
        client.send(JSON.stringify({ event: "ping" }));
        expect(await pongPromise).toEqual({ event: "pong", data: null });

        const binaryReplyPromise = new Promise<Buffer>((resolve) => {
            client.once("message", (raw) => resolve(raw as Buffer));
        });
        const payload = Buffer.from("hello-bytes");
        client.send(encodeWsBinaryFrame({ event: "audio-chunk", payload }), { binary: true });
        const decoded = decodeReply(await binaryReplyPromise);
        expect(decoded.payload).toEqual(Buffer.from([...payload].reverse()));
    });

    it("silently ignores a binary frame with no matching @BinaryMessage handler", async () => {
        const port = getFreePort();
        adapter = await bootstrapApp(port);

        const client = await connectClient(port, "/ws/media");
        clients.push(client);

        client.send(encodeWsBinaryFrame({ event: "unknown-binary-event", payload: Buffer.from("x") }), {
            binary: true,
        });

        // No crash, no reply — confirm the connection is still alive by
        // using a real handler right after.
        const pongPromise = new Promise<any>((resolve) => {
            client.once("message", (raw) => resolve(JSON.parse(raw.toString())));
        });
        client.send(JSON.stringify({ event: "ping" }));
        expect(await pongPromise).toEqual({ event: "pong", data: null });
    });
});

function decodeReply(raw: Buffer): { event: string; payload: Buffer } {
    const eventLength = raw[0];
    const event = raw.subarray(1, 1 + eventLength).toString("utf8");
    const payload = raw.subarray(1 + eventLength);
    return { event, payload };
}

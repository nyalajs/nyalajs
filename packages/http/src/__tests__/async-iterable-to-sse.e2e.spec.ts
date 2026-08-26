import "reflect-metadata";
import { describe, it, expect, afterEach } from "vitest";
import { Controller, Get } from "@nyalajs/core";
import { FastifyAdapter } from "../runtime/fastify-adapter";
import { asyncIterableToSse } from "../response/async-iterable-to-sse";

function mockContainer(controllerInstances: Map<any, any>) {
    const requestContainer = {
        register: () => {},
        resolve: (token: any) => {
            if (typeof token !== "function") return undefined;
            if (!controllerInstances.has(token)) {
                controllerInstances.set(token, new token());
            }
            return controllerInstances.get(token);
        },
    };
    return {
        createRequestScope: () => requestContainer,
        resolve: () => undefined,
    } as any;
}

function getFreePort(): number {
    return 58000 + Math.floor(Math.random() * 5000);
}

async function* fakeTokenStream(tokens: string[]): AsyncIterable<string> {
    for (const token of tokens) {
        await new Promise((r) => setTimeout(r, 2));
        yield token;
    }
}

async function readAllSseEvents(response: Response): Promise<Array<{ event: string; data: string }>> {
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    const frames: Array<{ event: string; data: string }> = [];

    while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let boundary: number;
        while ((boundary = buffer.indexOf("\n\n")) !== -1) {
            const raw = buffer.slice(0, boundary);
            buffer = buffer.slice(boundary + 2);
            const eventMatch = raw.match(/^event: (.+)$/m);
            const dataMatch = raw.match(/^data: (.*)$/m);
            frames.push({ event: eventMatch?.[1] ?? "message", data: dataMatch?.[1] ?? "" });
        }
    }

    return frames;
}

describe("asyncIterableToSse (e2e) — bridges an AsyncIterable<string> (e.g. @nyalajs/ai's stream()) to SSE", () => {
    let adapter: FastifyAdapter | undefined;

    afterEach(async () => {
        await adapter?.close();
        adapter = undefined;
    });

    it("streams each yielded value as a separate SSE event, then a done event, to a real HTTP client", async () => {
        @Controller()
        class ChatController {
            @Get("/chat/stream")
            streamReply() {
                return asyncIterableToSse(fakeTokenStream(["Hel", "lo", ",", " world", "!"]));
            }
        }

        const port = getFreePort();
        adapter = new FastifyAdapter(mockContainer(new Map()), {
            session: false,
            swagger: false,
            helmet: false,
            rateLimit: false,
            cors: false,
            csrf: false,
            compress: false,
        });
        adapter.registerResolvedRoutes([
            { method: "GET", path: "/chat/stream", controller: ChatController, handlerName: "streamReply", metadata: {} },
        ]);
        await adapter.listen(port);

        const response = await fetch(`http://127.0.0.1:${port}/chat/stream`);
        expect(response.headers.get("content-type")).toContain("text/event-stream");

        const frames = await readAllSseEvents(response);

        const chunkFrames = frames.filter((f) => f.event === "chunk");
        expect(chunkFrames.map((f) => f.data)).toEqual(["Hel", "lo", ",", " world", "!"]);

        const reassembled = chunkFrames.map((f) => f.data).join("");
        expect(reassembled).toBe("Hello, world!");

        expect(frames[frames.length - 1].event).toBe("done");
    });

    it("sends an error event and closes if the source iterable throws mid-stream", async () => {
        async function* failingStream(): AsyncIterable<string> {
            yield "partial";
            throw new Error("upstream provider failed");
        }

        @Controller()
        class FailingController {
            @Get("/chat/fails")
            streamReply() {
                return asyncIterableToSse(failingStream());
            }
        }

        const port = getFreePort();
        adapter = new FastifyAdapter(mockContainer(new Map()), {
            session: false,
            swagger: false,
            helmet: false,
            rateLimit: false,
            cors: false,
            csrf: false,
            compress: false,
        });
        adapter.registerResolvedRoutes([
            { method: "GET", path: "/chat/fails", controller: FailingController, handlerName: "streamReply", metadata: {} },
        ]);
        await adapter.listen(port);

        const response = await fetch(`http://127.0.0.1:${port}/chat/fails`);
        const frames = await readAllSseEvents(response);

        expect(frames[0]).toEqual({ event: "chunk", data: "partial" });
        expect(frames[1].event).toBe("error");
        expect(JSON.parse(frames[1].data).message).toBe("upstream provider failed");
    });

    it("supports a custom event name instead of the default 'chunk'", async () => {
        @Controller()
        class TokenController {
            @Get("/tokens")
            streamReply() {
                return asyncIterableToSse(fakeTokenStream(["a", "b"]), { event: "token", doneEvent: null });
            }
        }

        const port = getFreePort();
        adapter = new FastifyAdapter(mockContainer(new Map()), {
            session: false,
            swagger: false,
            helmet: false,
            rateLimit: false,
            cors: false,
            csrf: false,
            compress: false,
        });
        adapter.registerResolvedRoutes([
            { method: "GET", path: "/tokens", controller: TokenController, handlerName: "streamReply", metadata: {} },
        ]);
        await adapter.listen(port);

        const response = await fetch(`http://127.0.0.1:${port}/tokens`);
        const frames = await readAllSseEvents(response);

        expect(frames).toEqual([
            { event: "token", data: "a" },
            { event: "token", data: "b" },
        ]);
    });
});

import "reflect-metadata";
import { describe, it, expect, afterEach } from "vitest";
import { Controller, Get } from "@nyalajs/core";
import { FastifyAdapter } from "../runtime/fastify-adapter";
import { SseStream } from "../response/sse-stream";
import { StreamableResponse } from "../response/streamable.interface";
import { Readable } from "stream";

// Same pattern as fastify-adapter.spec.ts's requestContainer/container mocks:
// the adapter's per-request scope needs register()/resolve() (it stores
// REQUEST_CONTEXT/REQUEST/RESPONSE there), and the top-level container needs
// createRequestScope() to hand that back.
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
    return 53000 + Math.floor(Math.random() * 5000);
}

async function readAllSseEvents(response: Response, expectedCount: number): Promise<string[]> {
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    const frames: string[] = [];

    while (frames.length < expectedCount) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let boundary: number;
        while ((boundary = buffer.indexOf("\n\n")) !== -1) {
            frames.push(buffer.slice(0, boundary));
            buffer = buffer.slice(boundary + 2);
        }
    }

    reader.cancel().catch(() => {});
    return frames;
}

describe("SSE streaming (e2e)", () => {
    let adapter: FastifyAdapter | undefined;

    afterEach(async () => {
        await adapter?.close();
        adapter = undefined;
    });

    it("streams real SSE frames a real HTTP client can read incrementally", async () => {
        @Controller()
        class ProgressController {
            @Get("/progress")
            track() {
                const sse = new SseStream();
                let i = 0;
                const timer = setInterval(() => {
                    i++;
                    sse.send({ event: "progress", data: { pct: i * 25 } });
                    if (i === 4) {
                        clearInterval(timer);
                        sse.close();
                    }
                }, 5);
                return sse;
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
            { method: "GET", path: "/progress", controller: ProgressController, handlerName: "track", metadata: {} },
        ]);
        await adapter.listen(port);

        const response = await fetch(`http://127.0.0.1:${port}/progress`);
        expect(response.headers.get("content-type")).toContain("text/event-stream");

        const frames = await readAllSseEvents(response, 4);

        expect(frames).toHaveLength(4);
        expect(frames[0]).toBe("event: progress\ndata: {\"pct\":25}");
        expect(frames[3]).toBe("event: progress\ndata: {\"pct\":100}");
    });

    it("streams a raw StreamableResponse (non-SSE) with custom headers, e.g. a file download", async () => {
        @Controller()
        class DownloadController {
            @Get("/download")
            download(): StreamableResponse {
                return {
                    stream: Readable.from(["chunk-1", "chunk-2", "chunk-3"]),
                    contentType: "text/plain",
                    headers: { "Content-Disposition": 'attachment; filename="report.txt"' },
                };
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
            { method: "GET", path: "/download", controller: DownloadController, handlerName: "download", metadata: {} },
        ]);
        await adapter.listen(port);

        const response = await fetch(`http://127.0.0.1:${port}/download`);

        expect(response.headers.get("content-type")).toContain("text/plain");
        expect(response.headers.get("content-disposition")).toBe('attachment; filename="report.txt"');

        const body = await response.text();
        expect(body).toBe("chunk-1chunk-2chunk-3");
    });

    it("destroys the stream when the client disconnects mid-stream", async () => {
        let destroyed = false;

        @Controller()
        class InfiniteController {
            @Get("/infinite")
            stream(): StreamableResponse {
                const readable = new Readable({
                    read() {
                        this.push("x");
                    },
                });
                readable.on("close", () => {
                    destroyed = readable.destroyed;
                });
                return { stream: readable, contentType: "text/plain" };
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
            { method: "GET", path: "/infinite", controller: InfiniteController, handlerName: "stream", metadata: {} },
        ]);
        await adapter.listen(port);

        const controller = new AbortController();
        const response = await fetch(`http://127.0.0.1:${port}/infinite`, { signal: controller.signal });
        const reader = response.body!.getReader();
        await reader.read(); // confirm at least one chunk arrived before aborting
        controller.abort();
        await reader.cancel().catch(() => {});

        await new Promise((resolve) => setTimeout(resolve, 100));

        expect(destroyed).toBe(true);

        // A deliberately-aborted fetch against a genuinely infinite server
        // stream can leave the underlying socket in a state where Fastify's
        // own graceful app.close() (which waits for connections to end
        // cleanly) hangs — expected given what this test does on purpose,
        // not something to paper over. Destroy the raw HTTP server directly
        // instead of going through afterEach's adapter.close() for this one
        // test, and skip afterEach's close by clearing `adapter`.
        adapter!.getInstance().server.closeAllConnections?.();
        adapter!.getInstance().server.close();
        adapter = undefined;
    });
});

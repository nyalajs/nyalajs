import { SseStream } from "./sse-stream";

export interface AsyncIterableToSseOptions {
    /** Event name each chunk is sent under. Defaults to "chunk". */
    event?: string;
    /** Event name sent once the source iterable completes, with no data. Defaults to "done". Pass null to skip it. */
    doneEvent?: string | null;
    heartbeatMs?: number;
}

/**
 * Bridges any `AsyncIterable<string>` — most notably `@nyalajs/ai`'s
 * `AiProvider.stream()` / `AiService.stream()`, but generically anything
 * that yields text incrementally — onto an SseStream a handler can return
 * directly. Iterates the source and forwards each value as one SSE event;
 * closes the stream when the source completes or throws.
 *
 * @example
 *   @Controller("/chat")
 *   export class ChatController {
 *     constructor(private ai: AiService) {}
 *
 *     @Post("/stream")
 *     streamReply(@Body() body: { message: string }) {
 *       return asyncIterableToSse(
 *         this.ai.stream([{ role: "user", content: body.message }])
 *       );
 *     }
 *   }
 *
 *   // Browser:
 *   //   const es = new EventSource("/chat/stream", { method: "POST", ... });
 *   //   es.addEventListener("chunk", (e) => append(e.data));
 *   //   es.addEventListener("done", () => es.close());
 */
export function asyncIterableToSse(
    source: AsyncIterable<string>,
    options: AsyncIterableToSseOptions = {}
): SseStream {
    const event = options.event ?? "chunk";
    const doneEvent = options.doneEvent === undefined ? "done" : options.doneEvent;
    const sse = new SseStream({ heartbeatMs: options.heartbeatMs });

    (async () => {
        try {
            for await (const chunk of source) {
                if (sse.isClosed()) return; // client disconnected — stop pulling from the source
                sse.send({ event, data: chunk });
            }
            if (doneEvent) sse.send({ event: doneEvent, data: null });
        } catch (error) {
            if (!sse.isClosed()) {
                sse.send({ event: "error", data: { message: (error as Error).message } });
            }
        } finally {
            sse.close();
        }
    })();

    return sse;
}

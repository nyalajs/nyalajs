import { FastifyRequest, FastifyReply } from "fastify";
import { RequestContext } from "../../context/request-context";
import { StreamableResponse } from "../../response/streamable.interface";

/**
 * Pipes a StreamableResponse (an SseStream, or any raw Readable a
 * handler returns) to the client. Sets headers up front — once any data
 * is written, headers can no longer change, so status/content-type/
 * custom headers must all be applied before the stream starts flowing.
 *
 * Logs "Request completed" when the stream actually ends, not when
 * `reply.send()` returns (which happens the instant piping *starts* —
 * see the caller). Also listens for the client disconnecting mid-stream
 * (`request.raw` "close") and destroys the stream so a handler pushing
 * into an abandoned SseStream doesn't leak — a long-poll/SSE connection
 * with no client on the other end otherwise runs forever.
 */
export function sendStream(
    reply: FastifyReply,
    streamable: StreamableResponse,
    request: FastifyRequest,
    context: RequestContext,
    startTime: number
): void {
    reply.status(streamable.statusCode ?? 200);
    reply.type(streamable.contentType ?? "application/octet-stream");
    for (const [key, value] of Object.entries(streamable.headers ?? {})) {
        reply.header(key, value);
    }

    // reply.raw's "close" fires whenever the underlying connection ends
    // — a normal, fully-sent response closes its connection too, not
    // just a client hanging up mid-stream — so only actually destroy
    // the source stream if the response was NOT cleanly finished when
    // this fired. Otherwise a long-lived SSE stream that outlives the
    // client (browser closed, network dropped) would keep running
    // forever with nothing pushing data anywhere.
    const onClientDisconnect = () => {
        if (!reply.raw.writableEnded && !streamable.stream.destroyed) {
            streamable.stream.destroy();
        }
    };
    reply.raw.once("close", onClientDisconnect);

    let logged = false;
    const logCompletion = () => {
        if (logged) return; // "end" and "close" can both fire for the same stream
        logged = true;
        reply.raw.removeListener("close", onClientDisconnect);
        console.log(
            JSON.stringify({
                level: "info",
                message: "Request completed",
                requestId: context.requestId,
                traceId: context.traceId,
                method: request.method,
                path: request.url,
                statusCode: reply.statusCode,
                duration: Date.now() - startTime,
                streamed: true,
                timestamp: new Date().toISOString(),
            })
        );
    };

    streamable.stream.once("end", logCompletion);
    streamable.stream.once("close", logCompletion);
    streamable.stream.once("error", (error: Error) => {
        console.error(
            JSON.stringify({
                level: "error",
                message: "Stream error",
                requestId: context.requestId,
                error: error.message,
            })
        );
    });

    reply.send(streamable.stream);
}

import { FastifyInstance } from "fastify";
import type {} from "@fastify/websocket"; // augments FastifyInstance's route options with `websocket: true` — import for the side-effecting type augmentation only
import { Container } from "@nyalajs/core";
import { GatewayResolver, ResolvedGateway } from "./gateway-resolver";
import { NyalaSocket } from "./nyala-socket";
import { RoomRegistry } from "./room-registry";
import { decodeWsFrame, decodeWsBinaryFrame } from "./ws-protocol";
import { getWsParamMetadata, WsParamType } from "../decorators/params";

/**
 * Binds every @WebSocketGateway() found in the module graph onto the given
 * Fastify instance via @fastify/websocket — one upgrade route per gateway's
 * `path`, each with its own RoomRegistry (rooms don't cross gateways).
 *
 * Call registerWebSocketGateways() AFTER `app.register(require("@fastify/websocket"))`
 * and before `app.listen()` — same ordering constraint as any other Fastify
 * route registration.
 */
export async function registerWebSocketGateways(
    app: FastifyInstance,
    container: Container,
    resolver: GatewayResolver
): Promise<void> {
    const gateways = resolver.resolveGateways();

    for (const gateway of gateways) {
        bindGateway(app, container, gateway);
    }
}

function bindGateway(app: FastifyInstance, container: Container, gateway: ResolvedGateway): void {
    const rooms = new RoomRegistry();
    const handlerByEvent = new Map(gateway.subscriptions.map((s) => [s.event, s.handlerName]));
    const binaryHandlerByEvent = new Map(gateway.binarySubscriptions.map((s) => [s.event, s.handlerName]));

    app.get(gateway.path, { websocket: true }, (connection: any, request) => {
        // @fastify/websocket v8/v9 hand the raw ws.WebSocket directly as the
        // first arg; v10+ wrap it as {socket}. Support both without forcing
        // a specific @fastify/websocket major version on the app.
        const rawSocket = connection.socket ?? connection;

        const gatewayInstance = container.resolve(gateway.gatewayClass) as any;
        const socket = new NyalaSocket(rawSocket, rooms);

        if (gateway.onConnectHandler) {
            invokeSafely(() => gatewayInstance[gateway.onConnectHandler as string](socket));
        }

        // `ws` reports whether a frame was sent as WebSocket's native binary
        // opcode via this second argument — not something to sniff from the
        // bytes themselves. A text frame always goes through the JSON
        // @SubscribeMessage() path; a binary frame always goes through the
        // length-prefixed @BinaryMessage() path (see ws-protocol.ts).
        rawSocket.on("message", (raw: Buffer, isBinary: boolean) => {
            if (isBinary) {
                dispatchBinary(raw);
                return;
            }
            dispatchText(raw);
        });

        function dispatchText(raw: Buffer): void {
            let frame;
            try {
                frame = decodeWsFrame(raw.toString("utf8"));
            } catch (error) {
                socket.emit("error", { message: (error as Error).message });
                return;
            }

            const handlerName = handlerByEvent.get(frame.event);
            if (!handlerName) return; // no @SubscribeMessage() for this event — silently ignore, same as an unhandled DOM event

            const args = resolveArgs(gateway.gatewayClass, handlerName, frame.data, socket);

            invokeSafely(async () => {
                const result = await gatewayInstance[handlerName as string](...args);
                // A handler can optionally return { event, data } to reply
                // directly to the sender, mirroring how an HTTP handler
                // returns its response body instead of calling res.send().
                if (result && typeof result === "object" && typeof result.event === "string") {
                    socket.emit(result.event, result.data);
                }
            });
        }

        function dispatchBinary(raw: Buffer): void {
            let frame;
            try {
                frame = decodeWsBinaryFrame(raw);
            } catch (error) {
                socket.emit("error", { message: (error as Error).message });
                return;
            }

            const handlerName = binaryHandlerByEvent.get(frame.event);
            if (!handlerName) return; // no @BinaryMessage() for this event — silently ignore

            const args = resolveArgs(gateway.gatewayClass, handlerName, frame.payload, socket);

            invokeSafely(async () => {
                const result = await gatewayInstance[handlerName as string](...args);
                if (result instanceof Buffer) {
                    // A binary handler can return a raw Buffer to reply with
                    // — mirrors the JSON path's {event, data} convenience,
                    // but there's no event name to reuse on the reply side
                    // (a Buffer alone carries none), so it replies under the
                    // same event name the client sent.
                    socket.emitBinary(frame.event, result);
                } else if (result && typeof result === "object" && typeof result.event === "string") {
                    socket.emit(result.event, result.data);
                }
            });
        }

        // .once(), not .on(): "close" should only ever fire once per
        // connection, but guaranteeing it here means @OnDisconnect() can
        // never double-fire even if some caller (or a future ws upgrade)
        // somehow triggers it more than once.
        rawSocket.once("close", () => {
            rooms.leaveAll(socket);
            if (gateway.onDisconnectHandler) {
                invokeSafely(() => gatewayInstance[gateway.onDisconnectHandler as string](socket));
            }
        });

        rawSocket.on("error", (error: Error) => {
            console.error(
                JSON.stringify({
                    level: "error",
                    message: "WebSocket connection error",
                    path: gateway.path,
                    error: error.message,
                })
            );
        });
    });
}

function resolveArgs(gatewayClass: any, handlerName: string | symbol, data: any, socket: NyalaSocket): any[] {
    const paramMeta = getWsParamMetadata(gatewayClass, handlerName);

    if (paramMeta.length === 0) {
        // No @MessageBody()/@ConnectedSocket() decorators: pass the raw data positionally.
        return [data];
    }

    const args: any[] = [];
    for (const meta of [...paramMeta].sort((a, b) => a.index - b.index)) {
        args[meta.index] = meta.type === WsParamType.BODY ? data : socket;
    }
    return args;
}

function invokeSafely(fn: () => any): void {
    try {
        const result = fn();
        if (result && typeof result.catch === "function") {
            result.catch((error: Error) => logHandlerError(error));
        }
    } catch (error) {
        logHandlerError(error as Error);
    }
}

function logHandlerError(error: Error): void {
    console.error(
        JSON.stringify({
            level: "error",
            message: "Unhandled WebSocket gateway handler error",
            error: error.message,
        })
    );
}

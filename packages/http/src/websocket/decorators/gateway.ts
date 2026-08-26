import "reflect-metadata";

export const NYALA_WS_GATEWAY = "nyala:ws:gateway";

export interface WebSocketGatewayOptions {
    /**
     * The URL path this gateway upgrades on, e.g. "/ws/chat". Defaults to
     * "/ws". Distinct gateways in the same app must use distinct paths —
     * unlike Socket.IO namespaces multiplexed over one connection, each
     * gateway here is its own upgrade endpoint (matches how @fastify/websocket
     * itself routes: one handler per path).
     */
    path?: string;
}

/**
 * Marks a class as a WebSocket gateway — the real-time counterpart to
 * @Controller(). Methods decorated with @SubscribeMessage() inside it are
 * resolved through the same DI container as HTTP controllers, so a gateway
 * can depend on any other provider (services, repositories, ...).
 *
 * @example
 *   @WebSocketGateway({ path: "/ws/chat" })
 *   export class ChatGateway {
 *     constructor(private chatService: ChatService) {}
 *
 *     @SubscribeMessage("message")
 *     onMessage(@MessageBody() body: { text: string }, @ConnectedSocket() socket: NyalaSocket) {
 *       socket.broadcast("message", body);
 *     }
 *   }
 */
export function WebSocketGateway(options: WebSocketGatewayOptions = {}): ClassDecorator {
    return (target) => {
        Reflect.defineMetadata(NYALA_WS_GATEWAY, { path: options.path ?? "/ws" }, target);
    };
}

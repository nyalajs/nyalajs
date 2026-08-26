import "reflect-metadata";

export const NYALA_WS_SUBSCRIPTIONS = "nyala:ws:subscriptions";
export const NYALA_WS_BINARY_SUBSCRIPTIONS = "nyala:ws:binary-subscriptions";

export interface WsSubscriptionDefinition {
    event: string;
    handlerName: string | symbol;
}

/**
 * Marks a gateway method as the handler for one WebSocket event name.
 * Mirrors @MessagePattern() from @nyalajs/microservices, but for
 * bidirectional real-time connections instead of RPC — the event name is
 * read from the client-sent frame's `event` field (see wire format in
 * ws-protocol.ts).
 */
export function SubscribeMessage(event: string): MethodDecorator {
    return (target, propertyKey) => {
        const subscriptions: WsSubscriptionDefinition[] =
            Reflect.getMetadata(NYALA_WS_SUBSCRIPTIONS, target.constructor) ?? [];

        subscriptions.push({ event, handlerName: propertyKey });

        Reflect.defineMetadata(NYALA_WS_SUBSCRIPTIONS, subscriptions, target.constructor);
    };
}

/**
 * Marks a gateway method as the handler for one *binary* WebSocket event
 * name — for raw bytes (uploaded audio/video/file chunks, protobuf, ...)
 * instead of JSON. A separate metadata key from @SubscribeMessage() so a
 * gateway can use the same event name for a JSON control message and a
 * binary payload as two distinct handlers if that's useful, without either
 * shadowing the other. See ws-protocol.ts's WsBinaryFrame for the wire
 * format (a client must length-prefix the event name the same way).
 *
 * @example
 *   @BinaryMessage("audio-chunk")
 *   onAudioChunk(@BinaryPayload() chunk: Buffer, @ConnectedSocket() socket: NyalaSocket) {
 *     this.transcriber.feed(chunk);
 *   }
 */
export function BinaryMessage(event: string): MethodDecorator {
    return (target, propertyKey) => {
        const subscriptions: WsSubscriptionDefinition[] =
            Reflect.getMetadata(NYALA_WS_BINARY_SUBSCRIPTIONS, target.constructor) ?? [];

        subscriptions.push({ event, handlerName: propertyKey });

        Reflect.defineMetadata(NYALA_WS_BINARY_SUBSCRIPTIONS, subscriptions, target.constructor);
    };
}

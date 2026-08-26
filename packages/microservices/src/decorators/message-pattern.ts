import "reflect-metadata";

export const NYALA_MESSAGE_PATTERN = "nyala:microservices:message-pattern";
export const NYALA_EVENT_PATTERN = "nyala:microservices:event-pattern";

export interface PatternHandlerDefinition {
    pattern: string;
    handlerName: string | symbol;
    /** "message" expects a reply (request-response); "event" is fire-and-forget. */
    kind: "message" | "event";
}

function definePatternHandler(key: string, kind: "message" | "event") {
    return (pattern: string): MethodDecorator =>
        (target, propertyKey) => {
            const handlers: PatternHandlerDefinition[] =
                Reflect.getMetadata(key, target.constructor) ?? [];

            handlers.push({ pattern, handlerName: propertyKey, kind });

            Reflect.defineMetadata(key, handlers, target.constructor);
        };
}

/**
 * Marks a controller method as a request-response RPC handler for `pattern`.
 * The transport waits for this handler's return value (or thrown error) and
 * sends it back to the caller as the reply.
 *
 * @example
 *   @Controller()
 *   export class UsersController {
 *     @MessagePattern("users.findOne")
 *     findOne(@Payload() id: string) { ... }
 *   }
 */
export const MessagePattern = definePatternHandler(NYALA_MESSAGE_PATTERN, "message");

/**
 * Marks a controller method as a fire-and-forget event handler for `pattern`.
 * No reply is sent back to the emitter, and a thrown error is logged rather
 * than propagated anywhere.
 *
 * @example
 *   @Controller()
 *   export class NotificationsController {
 *     @EventPattern("order.created")
 *     onOrderCreated(@Payload() order: Order) { ... }
 *   }
 */
export const EventPattern = definePatternHandler(NYALA_EVENT_PATTERN, "event");

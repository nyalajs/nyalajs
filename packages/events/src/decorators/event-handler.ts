import "reflect-metadata";

export const EVENT_HANDLER_METADATA = "nyala:event-handler";

/**
 * Decorator that marks a method as an event handler.
 *
 * @example
 *   @Injectable()
 *   export class UserListeners {
 *     @EventHandler("user.created")
 *     async onUserCreated(payload: UserCreatedPayload) { ... }
 *   }
 */
export function EventHandler(eventName: string): MethodDecorator {
    return (target: any, propertyKey: string | symbol) => {
        const handlers = Reflect.getMetadata(EVENT_HANDLER_METADATA, target.constructor) ?? [];
        handlers.push({ eventName, method: propertyKey });
        Reflect.defineMetadata(EVENT_HANDLER_METADATA, handlers, target.constructor);
    };
}

import "reflect-metadata";

export const NYALA_WS_ON_CONNECT = "nyala:ws:on-connect";
export const NYALA_WS_ON_DISCONNECT = "nyala:ws:on-disconnect";

/** Marks a gateway method to run once, right after a client's connection is accepted. */
export function OnConnect(): MethodDecorator {
    return (target, propertyKey) => {
        Reflect.defineMetadata(NYALA_WS_ON_CONNECT, propertyKey, target.constructor);
    };
}

/** Marks a gateway method to run once, right after a client's connection closes (any reason). */
export function OnDisconnect(): MethodDecorator {
    return (target, propertyKey) => {
        Reflect.defineMetadata(NYALA_WS_ON_DISCONNECT, propertyKey, target.constructor);
    };
}

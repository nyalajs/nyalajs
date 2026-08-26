import "reflect-metadata";

const NYALA_WS_PARAMS = "nyala:ws:params";

export enum WsParamType {
    BODY = "body",
    SOCKET = "socket",
}

export interface WsParamMetadata {
    index: number;
    type: WsParamType;
}

function createWsParamDecorator(type: WsParamType) {
    return (): ParameterDecorator => (target, propertyKey, parameterIndex) => {
        if (propertyKey === undefined) return;

        const existing: WsParamMetadata[] =
            Reflect.getMetadata(NYALA_WS_PARAMS, target.constructor, propertyKey) ?? [];

        existing.push({ index: parameterIndex, type });

        Reflect.defineMetadata(NYALA_WS_PARAMS, existing, target.constructor, propertyKey);
    };
}

/** Injects the deserialized message body into the decorated parameter. */
export const MessageBody = createWsParamDecorator(WsParamType.BODY);

/** Injects the NyalaSocket (the connection that sent this message) into the decorated parameter. */
export const ConnectedSocket = createWsParamDecorator(WsParamType.SOCKET);

export function getWsParamMetadata(target: any, propertyKey: string | symbol): WsParamMetadata[] {
    return Reflect.getMetadata(NYALA_WS_PARAMS, target, propertyKey) ?? [];
}

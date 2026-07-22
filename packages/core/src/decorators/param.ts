import "reflect-metadata";

const PARAM_METADATA = "nyala:params";

export enum ParamType {
    BODY = "body",
    PARAM = "param",
    QUERY = "query",
    HEADERS = "headers",
    REQUEST = "request",
    RESPONSE = "response",
    UPLOADED_FILE = "uploadedFile",
    UPLOADED_FILES = "uploadedFiles",
    COOKIE = "cookie",
    IP = "ip",
    HOST = "host",
}

export interface ParamMetadata {
    index: number;
    type: ParamType;
    data?: string;
}

function createParamDecorator(type: ParamType) {
    return (data?: string): ParameterDecorator => {
        return (target, propertyKey, parameterIndex) => {
            if (propertyKey === undefined) {
                return;
            }

            const existing: ParamMetadata[] =
                Reflect.getMetadata(PARAM_METADATA, target.constructor, propertyKey) ?? [];

            existing.push({
                index: parameterIndex,
                type,
                data,
            });

            Reflect.defineMetadata(PARAM_METADATA, existing, target.constructor, propertyKey);
        };
    };
}

export const Body = createParamDecorator(ParamType.BODY);
export const Param = createParamDecorator(ParamType.PARAM);
export const Query = createParamDecorator(ParamType.QUERY);
export const Headers = createParamDecorator(ParamType.HEADERS);
export const Req = createParamDecorator(ParamType.REQUEST);
export const Res = createParamDecorator(ParamType.RESPONSE);
export const UploadedFile = createParamDecorator(ParamType.UPLOADED_FILE);
export const UploadedFiles = createParamDecorator(ParamType.UPLOADED_FILES);

/** Extract a single cookie value: @Cookie('session_id') */
export const Cookie = createParamDecorator(ParamType.COOKIE);

/** Extract the client IP address */
export const Ip = createParamDecorator(ParamType.IP);

/** Extract the Host header (virtual hosting) */
export const HostParam = createParamDecorator(ParamType.HOST);

export function getParamMetadata(target: any, propertyKey: string | symbol): ParamMetadata[] {
    return Reflect.getMetadata(PARAM_METADATA, target, propertyKey) ?? [];
}

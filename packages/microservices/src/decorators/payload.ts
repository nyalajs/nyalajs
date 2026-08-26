import "reflect-metadata";

export const NYALA_MICROSERVICE_PARAMS = "nyala:microservices:params";

export enum MicroserviceParamType {
    PAYLOAD = "payload",
    CONTEXT = "context",
}

export interface MicroserviceParamMetadata {
    index: number;
    type: MicroserviceParamType;
}

function createMicroserviceParamDecorator(type: MicroserviceParamType) {
    return (): ParameterDecorator => (target, propertyKey, parameterIndex) => {
        if (propertyKey === undefined) {
            return;
        }

        const existing: MicroserviceParamMetadata[] =
            Reflect.getMetadata(NYALA_MICROSERVICE_PARAMS, target.constructor, propertyKey) ?? [];

        existing.push({ index: parameterIndex, type });

        Reflect.defineMetadata(NYALA_MICROSERVICE_PARAMS, existing, target.constructor, propertyKey);
    };
}

/** Injects the deserialized message/event payload into the decorated parameter. */
export const Payload = createMicroserviceParamDecorator(MicroserviceParamType.PAYLOAD);

/** Injects the MicroserviceContext (pattern, transport metadata) into the decorated parameter. */
export const Ctx = createMicroserviceParamDecorator(MicroserviceParamType.CONTEXT);

export function getMicroserviceParamMetadata(
    target: any,
    propertyKey: string | symbol
): MicroserviceParamMetadata[] {
    return Reflect.getMetadata(NYALA_MICROSERVICE_PARAMS, target, propertyKey) ?? [];
}

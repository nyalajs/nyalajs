import "reflect-metadata";
import { ZodSchema } from "zod";

export const NYALA_MICROSERVICE_VALIDATION = "nyala:microservices:validation";

/**
 * Validates the incoming payload against a Zod schema before the handler
 * runs — same idea as @nyalajs/validation's @ValidateBody() for HTTP, but
 * for @MessagePattern()/@EventPattern() payloads, which have no
 * body/query/params split to target. On failure, throws
 * MicroservicePayloadValidationError with per-field details. The parsed
 * (and potentially transformed/stripped) value replaces the raw payload
 * before @Payload() injects it into the handler.
 *
 * @example
 *   @MessagePattern("users.create")
 *   @ValidatePayload(CreateUserSchema)
 *   create(@Payload() dto: CreateUserDto) { ... }
 */
export function ValidatePayload(schema: ZodSchema): MethodDecorator {
    return (target, propertyKey) => {
        Reflect.defineMetadata(NYALA_MICROSERVICE_VALIDATION, schema, target.constructor, propertyKey);
    };
}

export function getPayloadSchema(controllerType: any, handlerName: string | symbol): ZodSchema | undefined {
    return Reflect.getMetadata(NYALA_MICROSERVICE_VALIDATION, controllerType, handlerName);
}

export class MicroservicePayloadValidationError extends Error {
    constructor(
        message: string,
        public readonly details: Array<{ path: string; message: string }>
    ) {
        super(message);
        this.name = "MicroservicePayloadValidationError";
    }
}

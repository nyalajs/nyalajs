import "reflect-metadata";

export interface ApiPropertyOptions {
    description?: string;
    type?: any;
    example?: any;
    required?: boolean;
}

export interface ApiOperationOptions {
    summary?: string;
    description?: string;
    tags?: string[];
}

export interface ApiResponseOptions {
    status: number;
    description: string;
    type?: any;
    isArray?: boolean;
}

/**
 * Decorate a class property for OpenAPI generation.
 */
export function ApiProperty(options?: ApiPropertyOptions): PropertyDecorator {
    return (target: Object, propertyKey: string | symbol) => {
        const properties = Reflect.getMetadata("nyala:swagger:properties", target) || {};
        const designType = Reflect.getMetadata("design:type", target, propertyKey);

        properties[propertyKey] = {
            ...options,
            type: options?.type || designType?.name?.toLowerCase() || "string",
        };

        Reflect.defineMetadata("nyala:swagger:properties", properties, target);
    };
}

/**
 * Decorate a controller method to describe the operation for OpenAPI.
 */
export function ApiOperation(options: ApiOperationOptions): MethodDecorator {
    return (target: Object, propertyKey: string | symbol, descriptor: PropertyDescriptor) => {
        Reflect.defineMetadata("nyala:swagger:operation", options, descriptor.value!);
        return descriptor;
    };
}

/**
 * Decorate a controller method to describe a possible response.
 */
export function ApiResponse(options: ApiResponseOptions): MethodDecorator {
    return (target: Object, propertyKey: string | symbol, descriptor: PropertyDescriptor) => {
        const responses = Reflect.getMetadata("nyala:swagger:responses", descriptor.value!) || [];
        responses.push(options);
        Reflect.defineMetadata("nyala:swagger:responses", responses, descriptor.value!);
        return descriptor;
    };
}

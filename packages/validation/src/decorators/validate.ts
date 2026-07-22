import "reflect-metadata";
import { ZodSchema } from "zod";

export const VALIDATION_METADATA = "nyala:validation";

export enum ValidationTarget {
    BODY = "body",
    QUERY = "query",
    PARAMS = "params",
}

export interface ValidationRule {
    target: ValidationTarget;
    schema: ZodSchema;
}

function createValidationDecorator(target: ValidationTarget) {
    return (schema: ZodSchema): MethodDecorator => {
        return (classPrototype: any, propertyKey: string | symbol) => {
            const rules: ValidationRule[] =
                Reflect.getMetadata(VALIDATION_METADATA, classPrototype, propertyKey) ?? [];
            
            rules.push({ target, schema });
            Reflect.defineMetadata(VALIDATION_METADATA, rules, classPrototype, propertyKey);
        };
    };
}

export const ValidateBody = createValidationDecorator(ValidationTarget.BODY);
export const ValidateQuery = createValidationDecorator(ValidationTarget.QUERY);
export const ValidateParams = createValidationDecorator(ValidationTarget.PARAMS);

export function getValidationMetadata(classPrototype: any, propertyKey: string | symbol): ValidationRule[] {
    return Reflect.getMetadata(VALIDATION_METADATA, classPrototype, propertyKey) ?? [];
}

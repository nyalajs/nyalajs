import "reflect-metadata";
import { Inject } from "@nyala/core";

export function ConfigValue(key: string, defaultValue?: any): PropertyDecorator {
    return (target: any, propertyKey: string | symbol) => {
        // This would need integration with the DI container
        // For now, it's a placeholder for the decorator API
        Reflect.defineMetadata("config:key", key, target, propertyKey);
        Reflect.defineMetadata("config:default", defaultValue, target, propertyKey);
    };
}

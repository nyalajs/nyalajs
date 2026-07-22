import "reflect-metadata";
import { NYALA_VERSION } from "../constants/metadata-keys";

/**
 * Assigns an API version to a controller or individual route method.
 * If applied to a controller, all routes within it will inherit this version
 * unless overridden at the method level.
 * 
 * @param version The version string (e.g., '1', '2', '1.0') or array of versions
 */
export function Version(version: string | string[]): ClassDecorator & MethodDecorator {
    return (
        target: any,
        propertyKey?: string | symbol,
        descriptor?: PropertyDescriptor
    ) => {
        if (descriptor) {
            Reflect.defineMetadata(NYALA_VERSION, version, descriptor.value!);
            return descriptor;
        }
        Reflect.defineMetadata(NYALA_VERSION, version, target);
        return target;
    };
}

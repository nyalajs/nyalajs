import "reflect-metadata";
import { NYALA_GUARDS, NYALA_INTERCEPTORS } from "../constants/metadata-keys";
import { Type } from "../types/common";

/**
 * Attaches one or more guard classes to a controller class or route handler.
 * Guards are evaluated in order before the handler runs.
 *
 * @example
 *   @UseGuards(AuthGuard, RolesGuard)
 *   @Controller("/admin")
 *   export class AdminController { }
 */
export function UseGuards(...guards: Type[]): ClassDecorator & MethodDecorator {
    return (target: any, propertyKey?: string | symbol) => {
        if (propertyKey !== undefined) {
            // Method-level guard
            Reflect.defineMetadata(NYALA_GUARDS, guards, target.constructor, propertyKey);
        } else {
            // Class-level guard
            Reflect.defineMetadata(NYALA_GUARDS, guards, target);
        }
    };
}

/**
 * Attaches one or more interceptor classes to a controller class or route handler.
 * Interceptors wrap the handler in a before/after pipeline.
 *
 * @example
 *   @UseInterceptors(AuditInterceptor)
 *   @Post("/users")
 *   create(@Body() dto: CreateUserDto) { ... }
 */
export function UseInterceptors(...interceptors: Type[]): ClassDecorator & MethodDecorator {
    return (target: any, propertyKey?: string | symbol) => {
        if (propertyKey !== undefined) {
            Reflect.defineMetadata(NYALA_INTERCEPTORS, interceptors, target.constructor, propertyKey);
        } else {
            Reflect.defineMetadata(NYALA_INTERCEPTORS, interceptors, target);
        }
    };
}

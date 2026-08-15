import "reflect-metadata";
import { NYALA_CATCH_TYPES, NYALA_FILTERS } from "../constants/metadata-keys";
import { Type } from "../types/common";

/**
 * Declares which Error (sub)classes an ExceptionFilter handles. Attach the
 * filter itself to a controller or route with @UseFilters(). No arguments
 * means "catch everything" — same convention as NestJS.
 *
 * @example
 *   @Catch(NotFoundException)
 *   export class NotFoundFilter implements ExceptionFilter {
 *     catch(error, context, reply) { ... }
 *   }
 */
export function Catch(...errorTypes: Type<Error>[]): ClassDecorator {
    return (target: any) => {
        Reflect.defineMetadata(NYALA_CATCH_TYPES, errorTypes, target);
    };
}

/** Standalone reader, same convention as getParamMetadata() — used by FastifyAdapter, which has no MetadataScanner instance. */
export function getCatchTypes(filterType: Type): Type<Error>[] {
    return Reflect.getMetadata(NYALA_CATCH_TYPES, filterType) ?? [];
}

/**
 * Attaches one or more ExceptionFilter classes to a controller class or
 * route handler — same class-vs-method precedence as @UseGuards():
 * a method-level @UseFilters() replaces the controller's class-level one
 * rather than merging with it.
 *
 * Filters are tried in the order given; the first one whose @Catch() types
 * match (via `error instanceof type`, or unconditionally if @Catch() was
 * given no arguments) handles the error. If none match, the framework's
 * default ExceptionHandler runs, exactly as if @UseFilters() weren't used.
 *
 * @example
 *   @UseFilters(NotFoundFilter)
 *   @Controller("/posts")
 *   export class PostsController { }
 */
export function UseFilters(...filters: Type[]): ClassDecorator & MethodDecorator {
    return (target: any, propertyKey?: string | symbol) => {
        if (propertyKey !== undefined) {
            Reflect.defineMetadata(NYALA_FILTERS, filters, target.constructor, propertyKey);
        } else {
            Reflect.defineMetadata(NYALA_FILTERS, filters, target);
        }
    };
}

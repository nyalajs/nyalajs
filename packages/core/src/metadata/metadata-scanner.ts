import "reflect-metadata";
import {
    NYALA_MODULE,
    NYALA_CONTROLLER,
    NYALA_ROUTES,
    NYALA_INJECTABLE,
    NYALA_VERSION,
    NYALA_GUARDS,
    NYALA_INTERCEPTORS,
} from "../constants/metadata-keys";
import { Type } from "../types/common";
import { ModuleMetadata } from "../types/module";
import { ControllerMetadata } from "../decorators/controller";
import { RouteDefinition } from "../decorators/route";

export class MetadataScanner {
    getModuleMetadata(type: Type): ModuleMetadata | undefined {
        return Reflect.getMetadata(NYALA_MODULE, type);
    }

    getControllerMetadata(type: Type): ControllerMetadata | undefined {
        return Reflect.getMetadata(NYALA_CONTROLLER, type);
    }

    getRoutes(type: Type): RouteDefinition[] {
        return Reflect.getMetadata(NYALA_ROUTES, type) ?? [];
    }

    isInjectable(type: Type): boolean {
        return Reflect.getMetadata(NYALA_INJECTABLE, type) === true;
    }

    getVersion(target: Type | Function): string | string[] | undefined {
        return Reflect.getMetadata(NYALA_VERSION, target);
    }

    /**
     * Guards for one route: method-level @UseGuards() if present, otherwise
     * the controller's class-level @UseGuards(), otherwise none. Method and
     * class guards don't merge — a method-level @UseGuards() replaces the
     * class-level one, matching @UseGuards' own JSDoc example (class-level
     * guards protect every route unless a method opts into its own list).
     */
    getGuards(controllerType: Type, handlerName: string | symbol): Type[] {
        const methodGuards = Reflect.getMetadata(NYALA_GUARDS, controllerType, handlerName);
        if (methodGuards) return methodGuards;
        return Reflect.getMetadata(NYALA_GUARDS, controllerType) ?? [];
    }

    /** Same method-overrides-class precedence as getGuards(), for @UseInterceptors(). */
    getInterceptors(controllerType: Type, handlerName: string | symbol): Type[] {
        const methodInterceptors = Reflect.getMetadata(NYALA_INTERCEPTORS, controllerType, handlerName);
        if (methodInterceptors) return methodInterceptors;
        return Reflect.getMetadata(NYALA_INTERCEPTORS, controllerType) ?? [];
    }
}

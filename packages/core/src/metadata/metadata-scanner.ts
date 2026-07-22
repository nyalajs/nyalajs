import "reflect-metadata";
import {
    NYALA_MODULE,
    NYALA_CONTROLLER,
    NYALA_ROUTES,
    NYALA_INJECTABLE,
    NYALA_VERSION,
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
}

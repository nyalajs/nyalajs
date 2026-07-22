import "reflect-metadata";
import { NYALA_MODULE } from "../constants/metadata-keys";
import { ModuleMetadata } from "../types/module";

export function Module(metadata: ModuleMetadata): ClassDecorator {
    return (target) => {
        Reflect.defineMetadata(NYALA_MODULE, metadata, target);
    };
}

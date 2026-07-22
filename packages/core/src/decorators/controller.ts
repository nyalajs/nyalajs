import "reflect-metadata";
import { NYALA_CONTROLLER } from "../constants/metadata-keys";

export interface ControllerMetadata {
    prefix: string;
}

export function Controller(prefix = ""): ClassDecorator {
    return (target) => {
        Reflect.defineMetadata(
            NYALA_CONTROLLER,
            { prefix },
            target
        );
    };
}

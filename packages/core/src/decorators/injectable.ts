import "reflect-metadata";
import { NYALA_INJECTABLE } from "../constants/metadata-keys";

export function Injectable(): ClassDecorator {
    return (target) => {
        Reflect.defineMetadata(NYALA_INJECTABLE, true, target);
    };
}

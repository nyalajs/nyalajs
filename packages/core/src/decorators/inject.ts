import "reflect-metadata";
import { NYALA_INJECT_TOKENS } from "../constants/metadata-keys";
import { Token } from "../types/common";

export function Inject(token: Token): ParameterDecorator {
    return (target, propertyKey, parameterIndex) => {
        const existing =
            Reflect.getMetadata(NYALA_INJECT_TOKENS, target) ?? {};

        existing[parameterIndex] = token;

        Reflect.defineMetadata(NYALA_INJECT_TOKENS, existing, target);
    };
}

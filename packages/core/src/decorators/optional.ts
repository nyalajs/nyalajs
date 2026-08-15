import "reflect-metadata";
import { NYALA_OPTIONAL_TOKENS } from "../constants/metadata-keys";

/**
 * Marks a constructor parameter as optional: if no provider is registered
 * for its token, the Container resolves it to `undefined` instead of
 * throwing "Provider not found". Every other constructor parameter still
 * fails loudly if unregistered — this only relaxes the one parameter it's
 * applied to.
 *
 * @example
 *   constructor(
 *     private readonly userRepo: UserRepository,
 *     @Optional() private readonly metrics?: MetricsCollector
 *   ) { }
 */
export function Optional(): ParameterDecorator {
    return (target, _propertyKey, parameterIndex) => {
        const existing: Record<number, true> = Reflect.getMetadata(NYALA_OPTIONAL_TOKENS, target) ?? {};
        existing[parameterIndex] = true;
        Reflect.defineMetadata(NYALA_OPTIONAL_TOKENS, existing, target);
    };
}

import { Token } from "@nyalajs/core";
import { ClientOptions } from "../client/client-proxy.factory";
import { ClientProxy } from "../client/client-proxy";
import { ClientProxyFactory } from "../client/client-proxy.factory";
import { CircuitBreakerClientProxy } from "../resilience/circuit-breaker-client-proxy";
import { CircuitBreakerOptions } from "../resilience/circuit-breaker";

export interface ClientProviderOptions {
    /**
     * Wrap the client in a CircuitBreakerClientProxy — after
     * `failureThreshold` (default 5) consecutive send()/emit() failures,
     * calls fail immediately for `resetTimeoutMs` (default 30s) instead of
     * reaching the downstream service, then a single trial call decides
     * whether to resume. Off by default (undefined) — set to `true` for the
     * defaults, or pass options to tune them.
     */
    circuitBreaker?: boolean | CircuitBreakerOptions;
}

/**
 * Builds a DI provider for a named `ClientProxy`, so it can be requested
 * with `@Inject(token)` like any other provider — the container only
 * supports constructor injection, so `@Client()` is a provider factory
 * rather than a property decorator.
 *
 * @example
 *   // in a module:
 *   providers: [ClientProvider("USERS_SERVICE", { transport: "tcp", options: { port: 4001 } })]
 *
 *   // with a circuit breaker:
 *   providers: [ClientProvider("USERS_SERVICE", { transport: "tcp", options: { port: 4001 } }, {
 *     circuitBreaker: { failureThreshold: 3, resetTimeoutMs: 10_000 },
 *   })]
 *
 *   // in a consumer:
 *   constructor(@Inject("USERS_SERVICE") private readonly usersClient: ClientProxy) {}
 */
export function ClientProvider(token: Token, config: ClientOptions, providerOptions: ClientProviderOptions = {}) {
    return {
        provide: token,
        useFactory: (): ClientProxy => {
            const client = ClientProxyFactory.create(config);

            if (!providerOptions.circuitBreaker) return client;

            const circuitOptions = providerOptions.circuitBreaker === true ? {} : providerOptions.circuitBreaker;
            return new CircuitBreakerClientProxy(client, circuitOptions);
        },
    };
}

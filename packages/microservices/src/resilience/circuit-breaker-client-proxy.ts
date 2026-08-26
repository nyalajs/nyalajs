import { ClientProxy } from "../client/client-proxy";
import { CircuitBreaker, CircuitBreakerOptions } from "./circuit-breaker";

/**
 * Wraps any ClientProxy with a CircuitBreaker — `send()`/`emit()` calls
 * count toward the breaker's failure tracking; once it trips open, calls
 * fail immediately with CircuitOpenError instead of reaching the
 * (evidently struggling) downstream service at all.
 *
 * Deliberately separate from each transport's own reconnect/retry logic
 * (see e.g. TcpClientOptions.reconnect): reconnection handles the
 * *connection* dropping and coming back; the circuit breaker handles the
 * *service* being reachable but unhealthy (e.g. every call timing out
 * because a downstream handler is deadlocked) — piling up more calls
 * against a struggling-but-connected service makes it worse, exactly what
 * the circuit breaker exists to stop.
 *
 * @example
 *   const client = new CircuitBreakerClientProxy(
 *     new TcpClientProxy({ port: 4001 }),
 *     { failureThreshold: 5, resetTimeoutMs: 30_000 }
 *   );
 *
 * Or via ClientProvider's `circuitBreaker` option — see decorators/client.ts.
 */
export class CircuitBreakerClientProxy extends ClientProxy {
    private readonly breaker: CircuitBreaker;

    constructor(
        private readonly inner: ClientProxy,
        options: CircuitBreakerOptions = {}
    ) {
        super();
        this.breaker = new CircuitBreaker(options);
    }

    connect(): Promise<void> {
        // Deliberately NOT circuit-broken: connect() failing repeatedly is
        // already handled by each transport's own reconnect/backoff, and
        // send()/emit() call connect() internally anyway — breaking it here
        // too would double up two different retry/backoff policies against
        // the same failure.
        return this.inner.connect();
    }

    close(): Promise<void> {
        return this.inner.close();
    }

    send<TResult = any, TPayload = any>(pattern: string, payload: TPayload, timeoutMs?: number): Promise<TResult> {
        return this.breaker.execute(() => this.inner.send<TResult, TPayload>(pattern, payload, timeoutMs));
    }

    emit<TPayload = any>(pattern: string, payload: TPayload): Promise<void> {
        return this.breaker.execute(() => this.inner.emit<TPayload>(pattern, payload));
    }

    /** Reports unhealthy while the circuit is open, in addition to the wrapped client's own connectivity check. */
    async isHealthy(): Promise<boolean> {
        if (this.breaker.getState() === "open") return false;
        return this.inner.isHealthy();
    }

    /** The breaker's current state — "closed" | "open" | "half-open". Useful for logging/metrics/debugging. */
    getCircuitState() {
        return this.breaker.getState();
    }
}

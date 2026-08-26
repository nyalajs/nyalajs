export type CircuitState = "closed" | "open" | "half-open";

export interface CircuitBreakerOptions {
    /** Consecutive failures before the circuit trips open. Defaults to 5. */
    failureThreshold?: number;
    /**
     * How long the circuit stays open before allowing one trial call through
     * (half-open). Defaults to 30s.
     */
    resetTimeoutMs?: number;
    /**
     * Consecutive successes required in half-open state before the circuit
     * fully closes again. Defaults to 1 — a single successful trial call is
     * enough. Set higher to require more confidence before resuming full
     * traffic against a service that was just failing.
     */
    successThreshold?: number;
    /** Called on every state transition — useful for logging/metrics. */
    onStateChange?: (from: CircuitState, to: CircuitState) => void;
}

/**
 * Standard closed → open → half-open circuit breaker, transport-agnostic —
 * wraps any async operation via execute(). Not specific to ClientProxy on
 * purpose, so it's reusable if a circuit breaker is ever useful somewhere
 * else in the framework.
 *
 * - closed: calls pass through normally. A failure increments a counter;
 *   crossing failureThreshold consecutive failures trips the circuit open.
 *   A success resets the counter to 0.
 * - open: calls are rejected immediately (CircuitOpenError), without ever
 *   reaching the wrapped operation — the whole point is to stop hammering a
 *   downstream that's already struggling. After resetTimeoutMs, the circuit
 *   moves to half-open.
 * - half-open: the next call is allowed through as a trial. Success moves
 *   toward closed (see successThreshold); a failure immediately reopens the
 *   circuit and resets the reset-timeout clock.
 */
export class CircuitBreaker {
    private state: CircuitState = "closed";
    private consecutiveFailures = 0;
    private consecutiveSuccesses = 0;
    private openedAt = 0;
    private halfOpenTrialInFlight = false;

    constructor(private readonly options: CircuitBreakerOptions = {}) {}

    getState(): CircuitState {
        this.maybeTransitionToHalfOpen();
        return this.state;
    }

    async execute<T>(operation: () => Promise<T>): Promise<T> {
        this.maybeTransitionToHalfOpen();

        if (this.state === "open") {
            throw new CircuitOpenError();
        }

        if (this.state === "half-open") {
            if (this.halfOpenTrialInFlight) {
                // Only one trial call at a time in half-open — concurrent
                // callers during the trial fail fast instead of all piling
                // onto the service being tested.
                throw new CircuitOpenError();
            }
            this.halfOpenTrialInFlight = true;
        }

        try {
            const result = await operation();
            this.onSuccess();
            return result;
        } catch (error) {
            this.onFailure();
            throw error;
        } finally {
            this.halfOpenTrialInFlight = false;
        }
    }

    private onSuccess(): void {
        this.consecutiveFailures = 0;

        if (this.state === "half-open") {
            this.consecutiveSuccesses++;
            const successThreshold = this.options.successThreshold ?? 1;
            if (this.consecutiveSuccesses >= successThreshold) {
                this.transition("closed");
            }
        }
    }

    private onFailure(): void {
        this.consecutiveSuccesses = 0;

        if (this.state === "half-open") {
            // A failed trial call reopens immediately — no need to
            // accumulate failureThreshold failures again first.
            this.transition("open");
            return;
        }

        this.consecutiveFailures++;
        const failureThreshold = this.options.failureThreshold ?? 5;
        if (this.consecutiveFailures >= failureThreshold) {
            this.transition("open");
        }
    }

    private maybeTransitionToHalfOpen(): void {
        if (this.state !== "open") return;

        const resetTimeoutMs = this.options.resetTimeoutMs ?? 30_000;
        if (Date.now() - this.openedAt >= resetTimeoutMs) {
            this.transition("half-open");
        }
    }

    private transition(to: CircuitState): void {
        const from = this.state;
        if (from === to) return;

        this.state = to;
        if (to === "open") {
            this.openedAt = Date.now();
            this.consecutiveFailures = 0;
        }
        if (to === "half-open") {
            this.consecutiveSuccesses = 0;
        }

        this.options.onStateChange?.(from, to);
    }
}

export class CircuitOpenError extends Error {
    constructor() {
        super("Circuit breaker is open — call rejected without reaching the downstream service");
        this.name = "CircuitOpenError";
    }
}

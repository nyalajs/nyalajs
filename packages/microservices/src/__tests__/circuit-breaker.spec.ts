import { describe, it, expect, vi } from "vitest";
import { CircuitBreaker, CircuitOpenError } from "../resilience/circuit-breaker";

function failingOp(message = "boom") {
    return () => Promise.reject(new Error(message));
}

function succeedingOp<T>(value: T) {
    return () => Promise.resolve(value);
}

describe("CircuitBreaker", () => {
    it("starts closed and passes calls through", async () => {
        const breaker = new CircuitBreaker();
        expect(breaker.getState()).toBe("closed");
        expect(await breaker.execute(succeedingOp("ok"))).toBe("ok");
        expect(breaker.getState()).toBe("closed");
    });

    it("trips open after failureThreshold consecutive failures", async () => {
        const breaker = new CircuitBreaker({ failureThreshold: 3 });

        for (let i = 0; i < 3; i++) {
            await expect(breaker.execute(failingOp())).rejects.toThrow("boom");
        }

        expect(breaker.getState()).toBe("open");
    });

    it("a success resets the failure counter — doesn't trip on non-consecutive failures", async () => {
        const breaker = new CircuitBreaker({ failureThreshold: 3 });

        await expect(breaker.execute(failingOp())).rejects.toThrow("boom");
        await expect(breaker.execute(failingOp())).rejects.toThrow("boom");
        await breaker.execute(succeedingOp("ok")); // resets the counter
        await expect(breaker.execute(failingOp())).rejects.toThrow("boom");
        await expect(breaker.execute(failingOp())).rejects.toThrow("boom");

        // 4 failures total, but never 3 in a row — still closed.
        expect(breaker.getState()).toBe("closed");
    });

    it("rejects immediately with CircuitOpenError while open, without calling the operation", async () => {
        const breaker = new CircuitBreaker({ failureThreshold: 1 });
        await expect(breaker.execute(failingOp())).rejects.toThrow("boom");
        expect(breaker.getState()).toBe("open");

        const operation = vi.fn(succeedingOp("should not run"));
        await expect(breaker.execute(operation)).rejects.toBeInstanceOf(CircuitOpenError);
        expect(operation).not.toHaveBeenCalled();
    });

    it("moves to half-open after resetTimeoutMs and allows one trial call", async () => {
        const breaker = new CircuitBreaker({ failureThreshold: 1, resetTimeoutMs: 20 });
        await expect(breaker.execute(failingOp())).rejects.toThrow("boom");
        expect(breaker.getState()).toBe("open");

        await new Promise((r) => setTimeout(r, 30));
        expect(breaker.getState()).toBe("half-open");

        // A successful trial call closes the circuit (successThreshold defaults to 1).
        await breaker.execute(succeedingOp("recovered"));
        expect(breaker.getState()).toBe("closed");
    });

    it("a failed half-open trial reopens the circuit immediately", async () => {
        const breaker = new CircuitBreaker({ failureThreshold: 1, resetTimeoutMs: 20 });
        await expect(breaker.execute(failingOp())).rejects.toThrow("boom");
        await new Promise((r) => setTimeout(r, 30));
        expect(breaker.getState()).toBe("half-open");

        await expect(breaker.execute(failingOp("still broken"))).rejects.toThrow("still broken");
        expect(breaker.getState()).toBe("open");
    });

    it("half-open allows only one trial call at a time — concurrent callers fail fast", async () => {
        const breaker = new CircuitBreaker({ failureThreshold: 1, resetTimeoutMs: 20 });
        await expect(breaker.execute(failingOp())).rejects.toThrow("boom");
        await new Promise((r) => setTimeout(r, 30));
        expect(breaker.getState()).toBe("half-open");

        let resolveSlow: () => void;
        const slowOp = () => new Promise<string>((resolve) => { resolveSlow = () => resolve("done"); });

        const trial = breaker.execute(slowOp);
        // A second call arriving while the trial is still in flight must fail fast, not queue.
        await expect(breaker.execute(succeedingOp("second"))).rejects.toBeInstanceOf(CircuitOpenError);

        resolveSlow!();
        await trial;
        expect(breaker.getState()).toBe("closed");
    });

    it("respects a custom successThreshold before fully closing", async () => {
        const breaker = new CircuitBreaker({ failureThreshold: 1, resetTimeoutMs: 20, successThreshold: 2 });
        await expect(breaker.execute(failingOp())).rejects.toThrow("boom");
        await new Promise((r) => setTimeout(r, 30));
        expect(breaker.getState()).toBe("half-open");

        await breaker.execute(succeedingOp("1st trial"));
        expect(breaker.getState()).toBe("half-open"); // only 1 of 2 required successes so far

        await breaker.execute(succeedingOp("2nd trial"));
        expect(breaker.getState()).toBe("closed");
    });

    it("calls onStateChange on every transition", async () => {
        const transitions: Array<[string, string]> = [];
        const breaker = new CircuitBreaker({
            failureThreshold: 1,
            resetTimeoutMs: 20,
            onStateChange: (from, to) => transitions.push([from, to]),
        });

        await expect(breaker.execute(failingOp())).rejects.toThrow();
        await new Promise((r) => setTimeout(r, 30));
        breaker.getState(); // triggers the open -> half-open check
        await breaker.execute(succeedingOp("ok"));

        expect(transitions).toEqual([
            ["closed", "open"],
            ["open", "half-open"],
            ["half-open", "closed"],
        ]);
    });
});

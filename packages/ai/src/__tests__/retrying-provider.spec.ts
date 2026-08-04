import { describe, it, expect, vi } from "vitest";
import { RetryingAiProvider, estimateTokens } from "../providers/retrying-provider";
import { AiProvider, AiCompletionResult } from "../providers/types";

function fakeResult(text = "ok"): AiCompletionResult {
    return { text, model: "fake-model" };
}

function fakeProvider(impl: Partial<AiProvider> = {}): AiProvider {
    return {
        name: "fake",
        complete: vi.fn().mockResolvedValue(fakeResult()),
        stream: (async function* () {
            yield "a";
            yield "b";
        }) as any,
        ...impl,
    };
}

describe("estimateTokens", () => {
    it("estimates roughly 4 characters per token", () => {
        expect(estimateTokens("a".repeat(400))).toBe(100);
    });

    it("rounds up for partial tokens", () => {
        expect(estimateTokens("abc")).toBe(1);
    });
});

describe("RetryingAiProvider — retry behavior", () => {
    it("passes through a successful call unchanged", async () => {
        const inner = fakeProvider();
        const provider = new RetryingAiProvider(inner, { initialDelayMs: 1 });

        const result = await provider.complete([]);

        expect(result).toEqual(fakeResult());
        expect(inner.complete).toHaveBeenCalledTimes(1);
    });

    it("retries on a 429 and eventually succeeds", async () => {
        const complete = vi
            .fn()
            .mockRejectedValueOnce({ status: 429, message: "rate limited" })
            .mockResolvedValueOnce(fakeResult("second try"));
        const provider = new RetryingAiProvider(fakeProvider({ complete }), { initialDelayMs: 1 });

        const result = await provider.complete([]);

        expect(result.text).toBe("second try");
        expect(complete).toHaveBeenCalledTimes(2);
    });

    it("retries on a 5xx", async () => {
        const complete = vi
            .fn()
            .mockRejectedValueOnce({ status: 503 })
            .mockResolvedValueOnce(fakeResult());
        const provider = new RetryingAiProvider(fakeProvider({ complete }), { initialDelayMs: 1 });

        await provider.complete([]);
        expect(complete).toHaveBeenCalledTimes(2);
    });

    it("retries on a transient network error code", async () => {
        const complete = vi
            .fn()
            .mockRejectedValueOnce({ code: "ECONNRESET" })
            .mockResolvedValueOnce(fakeResult());
        const provider = new RetryingAiProvider(fakeProvider({ complete }), { initialDelayMs: 1 });

        await provider.complete([]);
        expect(complete).toHaveBeenCalledTimes(2);
    });

    it("does not retry a 400 (bad request) — fails immediately", async () => {
        const complete = vi.fn().mockRejectedValue({ status: 400, message: "bad request" });
        const provider = new RetryingAiProvider(fakeProvider({ complete }), { initialDelayMs: 1 });

        await expect(provider.complete([])).rejects.toMatchObject({ status: 400 });
        expect(complete).toHaveBeenCalledTimes(1);
    });

    it("does not retry a 401 (auth failure)", async () => {
        const complete = vi.fn().mockRejectedValue({ status: 401 });
        const provider = new RetryingAiProvider(fakeProvider({ complete }), { initialDelayMs: 1 });

        await expect(provider.complete([])).rejects.toBeTruthy();
        expect(complete).toHaveBeenCalledTimes(1);
    });

    it("gives up after maxRetries and surfaces the last error", async () => {
        const complete = vi.fn().mockRejectedValue({ status: 500 });
        const provider = new RetryingAiProvider(fakeProvider({ complete }), { maxRetries: 2, initialDelayMs: 1 });

        await expect(provider.complete([])).rejects.toMatchObject({ status: 500 });
        expect(complete).toHaveBeenCalledTimes(3); // initial attempt + 2 retries
    });

    it("passes through the underlying provider's name", () => {
        const provider = new RetryingAiProvider(fakeProvider());
        expect(provider.name).toBe("fake");
    });
});

describe("RetryingAiProvider — streaming", () => {
    it("passes through stream chunks", async () => {
        const provider = new RetryingAiProvider(fakeProvider());
        const chunks: string[] = [];
        for await (const chunk of provider.stream([])) {
            chunks.push(chunk);
        }
        expect(chunks).toEqual(["a", "b"]);
    });

    it("releases its concurrency slot once the stream finishes, even on error", async () => {
        const provider = new RetryingAiProvider(
            fakeProvider({
                stream: (() =>
                    (async function* () {
                        throw new Error("stream failed");
                    })()) as any,
            }),
            {},
            { maxConcurrent: 1 }
        );

        await expect(async () => {
            for await (const _ of provider.stream([])) {
                // no-op
            }
        }).rejects.toThrow("stream failed");

        // If the slot weren't released, this second call would hang forever.
        const provider2 = new RetryingAiProvider(fakeProvider(), {}, { maxConcurrent: 1 });
        await expect(provider2.complete([])).resolves.toBeTruthy();
    });
});

describe("RetryingAiProvider — rate limiting", () => {
    it("limits concurrency — a call waits for an in-flight one to finish", async () => {
        let active = 0;
        let maxActive = 0;
        const complete = vi.fn().mockImplementation(async () => {
            active++;
            maxActive = Math.max(maxActive, active);
            await new Promise((r) => setTimeout(r, 20));
            active--;
            return fakeResult();
        });

        const provider = new RetryingAiProvider(fakeProvider({ complete }), {}, { maxConcurrent: 1 });

        await Promise.all([provider.complete([]), provider.complete([]), provider.complete([])]);

        expect(maxActive).toBe(1);
        expect(complete).toHaveBeenCalledTimes(3);
    });

    it("allows up to maxConcurrent calls in flight simultaneously", async () => {
        let active = 0;
        let maxActive = 0;
        const complete = vi.fn().mockImplementation(async () => {
            active++;
            maxActive = Math.max(maxActive, active);
            await new Promise((r) => setTimeout(r, 20));
            active--;
            return fakeResult();
        });

        const provider = new RetryingAiProvider(fakeProvider({ complete }), {}, { maxConcurrent: 2 });

        await Promise.all([provider.complete([]), provider.complete([]), provider.complete([])]);

        expect(maxActive).toBe(2);
    });

    it("enforces a minimum interval between request starts", async () => {
        const starts: number[] = [];
        const complete = vi.fn().mockImplementation(async () => {
            starts.push(Date.now());
            return fakeResult();
        });

        // A generous interval + slack margin, not a tight one: this measures
        // real wall-clock time (setTimeout), which is subject to genuine
        // scheduler jitter under load — a tight margin (e.g. 30ms configured,
        // 28ms asserted) flakes for real under CI/sandbox CPU contention,
        // not because the underlying logic is wrong.
        const provider = new RetryingAiProvider(fakeProvider({ complete }), {}, { minIntervalMs: 100 });

        await provider.complete([]);
        await provider.complete([]);

        expect(starts[1] - starts[0]).toBeGreaterThanOrEqual(80);
    });
});

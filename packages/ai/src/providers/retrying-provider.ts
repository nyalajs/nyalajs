import { AiProvider, AiMessage, AiCompletionOptions, AiCompletionResult } from "./types";

export interface RetryConfig {
    maxRetries?: number;
    initialDelayMs?: number;
    maxDelayMs?: number;
}

export interface RateLimitConfig {
    /** Minimum milliseconds between the start of two requests. */
    minIntervalMs?: number;
    /** Max requests allowed to be in flight at once. */
    maxConcurrent?: number;
}

function isRetryableError(error: any): boolean {
    const status = error?.status ?? error?.statusCode;
    if (status === 429) return true;
    if (typeof status === "number" && status >= 500 && status < 600) return true;
    const code = error?.code;
    return code === "ECONNRESET" || code === "ETIMEDOUT" || code === "ECONNREFUSED" || code === "EAI_AGAIN";
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Rough, provider-agnostic token estimate (~4 characters/token for English
 * text). Real tokenizers differ per vendor and per model; this is only for
 * pre-flight budgeting (e.g. warning before a huge context gets sent) —
 * prefer a completion result's own reported `usage` once a call succeeds.
 */
export function estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
}

/**
 * Wraps any AiProvider with retry-with-backoff and a concurrency/interval
 * rate limiter, applied uniformly regardless of vendor. This is deliberately
 * a separate layer from the per-provider translators (AnthropicProvider,
 * OpenAiCompatibleProvider, ...): retries and rate limiting are identical
 * across vendors, so duplicating this logic inside each translator would
 * just be the same bug fixed (or not) N times.
 *
 * Every AiService-managed provider is wrapped in this — see ai.service.ts —
 * which matters most for the agentic resolve loop: without a shared limiter,
 * a runaway iteration loop has nothing stopping it from hammering the
 * provider's API on every retry.
 */
export class RetryingAiProvider implements AiProvider {
    readonly name: string;
    private inFlight = 0;
    private lastRequestAt = 0;
    private waiters: Array<() => void> = [];

    constructor(
        private readonly inner: AiProvider,
        private readonly retry: RetryConfig = {},
        private readonly rateLimit: RateLimitConfig = {}
    ) {
        this.name = inner.name;
    }

    async complete(messages: AiMessage[], options?: AiCompletionOptions): Promise<AiCompletionResult> {
        await this.acquireSlot();
        try {
            return await this.withRetry(() => this.inner.complete(messages, options));
        } finally {
            this.releaseSlot();
        }
    }

    async *stream(messages: AiMessage[], options?: AiCompletionOptions): AsyncIterable<string> {
        await this.acquireSlot();
        try {
            for await (const chunk of this.inner.stream(messages, options)) {
                yield chunk;
            }
        } finally {
            this.releaseSlot();
        }
    }

    private async withRetry<T>(fn: () => Promise<T>): Promise<T> {
        const maxRetries = this.retry.maxRetries ?? 3;
        const initialDelay = this.retry.initialDelayMs ?? 500;
        const maxDelay = this.retry.maxDelayMs ?? 8000;

        let attempt = 0;
        for (;;) {
            try {
                return await fn();
            } catch (error) {
                if (attempt >= maxRetries || !isRetryableError(error)) throw error;
                await sleep(Math.min(initialDelay * 2 ** attempt, maxDelay));
                attempt++;
            }
        }
    }

    private async acquireSlot(): Promise<void> {
        const maxConcurrent = this.rateLimit.maxConcurrent;
        if (maxConcurrent !== undefined) {
            while (this.inFlight >= maxConcurrent) {
                await new Promise<void>((resolve) => this.waiters.push(resolve));
            }
        }

        if (this.rateLimit.minIntervalMs) {
            const wait = this.rateLimit.minIntervalMs - (Date.now() - this.lastRequestAt);
            if (wait > 0) await sleep(wait);
        }

        this.inFlight++;
        this.lastRequestAt = Date.now();
    }

    private releaseSlot(): void {
        this.inFlight--;
        this.waiters.shift()?.();
    }
}

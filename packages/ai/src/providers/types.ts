export interface AiMessage {
    role: "system" | "user" | "assistant";
    content: string;
}

export interface AiCompletionOptions {
    model?: string;
    temperature?: number;
    maxTokens?: number;
}

export interface AiUsage {
    inputTokens: number;
    outputTokens: number;
}

export interface AiCompletionResult {
    text: string;
    model: string;
    usage?: AiUsage;
}

/**
 * A provider translates Nyala's canonical AiMessage[] to/from one vendor's
 * wire format. Cross-cutting concerns (retries, rate limiting, token
 * estimation) deliberately do NOT live here — see RetryingAiProvider —
 * because they're identical across vendors, while message formatting,
 * streaming, and tool-calling genuinely are not.
 */
export interface AiProvider {
    readonly name: string;
    complete(messages: AiMessage[], options?: AiCompletionOptions): Promise<AiCompletionResult>;
    stream(messages: AiMessage[], options?: AiCompletionOptions): AsyncIterable<string>;
}

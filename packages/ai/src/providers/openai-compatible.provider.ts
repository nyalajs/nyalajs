import { AiProvider, AiMessage, AiCompletionOptions, AiCompletionResult } from "./types";

export interface OpenAiCompatibleConfig {
    /** Ollama and some local/self-hosted endpoints don't require one. */
    apiKey?: string;
    /** Set for Groq/DeepSeek/OpenRouter/Ollama; omitted defaults to OpenAI's own endpoint. */
    baseURL?: string;
    /**
     * Required (not defaulted) — unlike Anthropic/Gemini there's no single
     * sensible default model across OpenAI, Groq, DeepSeek, OpenRouter, and
     * Ollama; each vendor's catalog is completely different.
     */
    defaultModel: string;
}

/**
 * Backs OpenAI, Groq, DeepSeek, OpenRouter, and Ollama — all of them speak
 * (a compatible subset of) the OpenAI chat completions API, differing only
 * in baseURL/apiKey/model catalog. This is why the provider count for this
 * package is much smaller than the vendor count: adding "Mistral" or any
 * other OpenAI-compatible endpoint later needs a config preset, not a new
 * provider class.
 */
export class OpenAiCompatibleProvider implements AiProvider {
    readonly name: string;
    private client: any;

    constructor(name: string, private readonly config: OpenAiCompatibleConfig) {
        this.name = name;
    }

    private async getClient(): Promise<any> {
        if (!this.client) {
            try {
                const { default: OpenAI } = await import("openai");
                this.client = new OpenAI({
                    apiKey: this.config.apiKey ?? "not-needed",
                    baseURL: this.config.baseURL,
                });
            } catch {
                throw new Error(
                    `[nyala/ai] provider "${this.name}" requires the optional peer dependency "openai" (used as a generic OpenAI-compatible client). Run: npm install openai`
                );
            }
        }
        return this.client;
    }

    async complete(messages: AiMessage[], options: AiCompletionOptions = {}): Promise<AiCompletionResult> {
        const client = await this.getClient();

        const response = await client.chat.completions.create({
            model: options.model ?? this.config.defaultModel,
            temperature: options.temperature,
            max_tokens: options.maxTokens,
            messages: messages.map((m) => ({ role: m.role, content: m.content })),
        });

        return {
            text: response.choices[0]?.message?.content ?? "",
            model: response.model,
            usage: response.usage
                ? { inputTokens: response.usage.prompt_tokens, outputTokens: response.usage.completion_tokens }
                : undefined,
        };
    }

    async *stream(messages: AiMessage[], options: AiCompletionOptions = {}): AsyncIterable<string> {
        const client = await this.getClient();

        const stream = await client.chat.completions.create({
            model: options.model ?? this.config.defaultModel,
            temperature: options.temperature,
            max_tokens: options.maxTokens,
            messages: messages.map((m) => ({ role: m.role, content: m.content })),
            stream: true,
        });

        for await (const chunk of stream) {
            const delta = chunk.choices[0]?.delta?.content;
            if (delta) yield delta;
        }
    }
}

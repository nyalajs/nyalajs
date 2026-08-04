import { AiProvider, AiMessage, AiCompletionOptions, AiCompletionResult } from "./types";

export interface AnthropicProviderConfig {
    /** Standard pay-per-token API key auth (x-api-key header). */
    apiKey?: string;
    /**
     * Bearer-token auth (Authorization: Bearer <token>) — the SDK's other
     * supported auth mechanism, distinct from apiKey. This is how you'd use
     * a token from a Claude subscription rather than a separately-billed
     * API key, if you already have one from your own login flow — this
     * package doesn't implement OAuth login itself, it just accepts a
     * token you already hold, exactly like the underlying SDK does.
     * Exactly one of apiKey/authToken must be set.
     */
    authToken?: string;
    defaultModel?: string;
}

const DEFAULT_MODEL = "claude-sonnet-5";

export class AnthropicProvider implements AiProvider {
    readonly name: string;
    private client: any;

    /**
     * `name` defaults to "anthropic" for standalone use, but AiService
     * passes the provider's config key instead — so two differently-
     * configured Anthropic providers (e.g. "fast" on Haiku, "smart" on
     * Opus) are distinguishable by name, consistent with how
     * OpenAiCompatibleProvider already has to work (no driver-level
     * default makes sense there across OpenAI/Groq/DeepSeek/OpenRouter).
     */
    constructor(private readonly config: AnthropicProviderConfig, name = "anthropic") {
        this.name = name;
    }

    private async getClient(): Promise<any> {
        if (!this.client) {
            try {
                const { default: Anthropic } = await import("@anthropic-ai/sdk");
                this.client = new Anthropic({ apiKey: this.config.apiKey, authToken: this.config.authToken });
            } catch {
                throw new Error(
                    '[nyala/ai] provider "anthropic" requires the optional peer dependency "@anthropic-ai/sdk". Run: npm install @anthropic-ai/sdk'
                );
            }
        }
        return this.client;
    }

    /** Anthropic takes `system` as a top-level param, not a message with role "system". */
    private splitSystem(messages: AiMessage[]): { system: string | undefined; rest: AiMessage[] } {
        const system = messages
            .filter((m) => m.role === "system")
            .map((m) => m.content)
            .join("\n\n");
        return { system: system || undefined, rest: messages.filter((m) => m.role !== "system") };
    }

    async complete(messages: AiMessage[], options: AiCompletionOptions = {}): Promise<AiCompletionResult> {
        const client = await this.getClient();
        const { system, rest } = this.splitSystem(messages);

        const response = await client.messages.create({
            model: options.model ?? this.config.defaultModel ?? DEFAULT_MODEL,
            max_tokens: options.maxTokens ?? 4096,
            temperature: options.temperature,
            system,
            messages: rest.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
        });

        const text = response.content
            .filter((block: any) => block.type === "text")
            .map((block: any) => block.text)
            .join("");

        return {
            text,
            model: response.model,
            usage: response.usage
                ? { inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens }
                : undefined,
        };
    }

    async *stream(messages: AiMessage[], options: AiCompletionOptions = {}): AsyncIterable<string> {
        const client = await this.getClient();
        const { system, rest } = this.splitSystem(messages);

        const stream = client.messages.stream({
            model: options.model ?? this.config.defaultModel ?? DEFAULT_MODEL,
            max_tokens: options.maxTokens ?? 4096,
            temperature: options.temperature,
            system,
            messages: rest.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
        });

        for await (const event of stream) {
            if (event.type === "content_block_delta" && event.delta?.type === "text_delta") {
                yield event.delta.text;
            }
        }
    }
}

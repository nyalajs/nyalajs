import { AiProvider, AiMessage, AiCompletionOptions, AiCompletionResult } from "./types";

export interface GeminiProviderConfig {
    apiKey: string;
    defaultModel?: string;
}

const DEFAULT_MODEL = "gemini-1.5-pro";

export class GeminiProvider implements AiProvider {
    readonly name: string;
    private client: any;

    /** See AnthropicProvider's constructor comment — same reasoning for the optional `name` override. */
    constructor(private readonly config: GeminiProviderConfig, name = "gemini") {
        this.name = name;
    }

    private async getClient(): Promise<any> {
        if (!this.client) {
            try {
                const { GoogleGenerativeAI } = await import("@google/generative-ai");
                this.client = new GoogleGenerativeAI(this.config.apiKey);
            } catch {
                throw new Error(
                    '[nyala/ai] provider "gemini" requires the optional peer dependency "@google/generative-ai". Run: npm install @google/generative-ai'
                );
            }
        }
        return this.client;
    }

    /** Gemini has no "system"-role message — it's a dedicated param on the model itself. */
    private buildModel(client: any, options: AiCompletionOptions, messages: AiMessage[]): any {
        const systemInstruction = messages
            .filter((m) => m.role === "system")
            .map((m) => m.content)
            .join("\n\n");

        return client.getGenerativeModel({
            model: options.model ?? this.config.defaultModel ?? DEFAULT_MODEL,
            systemInstruction: systemInstruction || undefined,
        });
    }

    /** Gemini calls the assistant role "model", not "assistant", and has no "system" entries in history. */
    private toHistory(messages: AiMessage[]): { role: string; parts: { text: string }[] }[] {
        return messages
            .filter((m) => m.role !== "system")
            .map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }));
    }

    private startChat(client: any, options: AiCompletionOptions, messages: AiMessage[]) {
        const model = this.buildModel(client, options, messages);
        const history = this.toHistory(messages);
        const lastMessage = history.pop();

        const chat = model.startChat({
            history,
            generationConfig: { maxOutputTokens: options.maxTokens, temperature: options.temperature },
        });

        return { chat, lastMessageText: lastMessage?.parts[0]?.text ?? "" };
    }

    async complete(messages: AiMessage[], options: AiCompletionOptions = {}): Promise<AiCompletionResult> {
        const client = await this.getClient();
        const { chat, lastMessageText } = this.startChat(client, options, messages);

        const result = await chat.sendMessage(lastMessageText);
        const usage = result.response.usageMetadata;

        return {
            text: result.response.text(),
            model: options.model ?? this.config.defaultModel ?? DEFAULT_MODEL,
            usage: usage
                ? { inputTokens: usage.promptTokenCount, outputTokens: usage.candidatesTokenCount }
                : undefined,
        };
    }

    async *stream(messages: AiMessage[], options: AiCompletionOptions = {}): AsyncIterable<string> {
        const client = await this.getClient();
        const { chat, lastMessageText } = this.startChat(client, options, messages);

        const result = await chat.sendMessageStream(lastMessageText);
        for await (const chunk of result.stream) {
            const text = chunk.text();
            if (text) yield text;
        }
    }
}

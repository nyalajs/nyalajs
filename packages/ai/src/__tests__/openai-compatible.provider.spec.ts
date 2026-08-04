import { describe, it, expect, vi, beforeEach } from "vitest";
import { OpenAiCompatibleProvider } from "../providers/openai-compatible.provider";

const { createMock, constructorSpy } = vi.hoisted(() => ({
    createMock: vi.fn(),
    constructorSpy: vi.fn(),
}));

vi.mock("openai", () => ({
    default: class MockOpenAI {
        chat = { completions: { create: createMock } };
        constructor(public config: any) {
            constructorSpy(config);
        }
    },
}));

describe("OpenAiCompatibleProvider", () => {
    beforeEach(() => {
        createMock.mockReset();
        constructorSpy.mockReset();
    });

    it("passes messages through with roles unchanged (no system-message rewriting needed)", async () => {
        createMock.mockResolvedValue({ choices: [{ message: { content: "hi" } }], model: "gpt-4o" });
        const provider = new OpenAiCompatibleProvider("openai", { apiKey: "key", defaultModel: "gpt-4o" });

        await provider.complete([
            { role: "system", content: "Be helpful." },
            { role: "user", content: "Hello" },
        ]);

        expect(createMock.mock.calls[0][0].messages).toEqual([
            { role: "system", content: "Be helpful." },
            { role: "user", content: "Hello" },
        ]);
    });

    it("maps usage from prompt_tokens/completion_tokens to the canonical shape", async () => {
        createMock.mockResolvedValue({
            choices: [{ message: { content: "hi" } }],
            model: "gpt-4o",
            usage: { prompt_tokens: 5, completion_tokens: 15 },
        });
        const provider = new OpenAiCompatibleProvider("openai", { apiKey: "key", defaultModel: "gpt-4o" });

        const result = await provider.complete([{ role: "user", content: "hi" }]);

        expect(result.usage).toEqual({ inputTokens: 5, outputTokens: 15 });
    });

    it("returns an empty string, not undefined/null, when the model returns no content", async () => {
        createMock.mockResolvedValue({ choices: [{ message: { content: null } }], model: "gpt-4o" });
        const provider = new OpenAiCompatibleProvider("openai", { apiKey: "key", defaultModel: "gpt-4o" });

        const result = await provider.complete([{ role: "user", content: "hi" }]);

        expect(result.text).toBe("");
    });

    it("streams only chunks that carry delta content", async () => {
        createMock.mockResolvedValue(
            (async function* () {
                yield { choices: [{ delta: { role: "assistant" } }] }; // no content yet
                yield { choices: [{ delta: { content: "Hel" } }] };
                yield { choices: [{ delta: { content: "lo" } }] };
                yield { choices: [{ delta: {}, finish_reason: "stop" }] };
            })()
        );
        const provider = new OpenAiCompatibleProvider("openai", { apiKey: "key", defaultModel: "gpt-4o" });

        const chunks: string[] = [];
        for await (const chunk of provider.stream([{ role: "user", content: "hi" }])) {
            chunks.push(chunk);
        }

        expect(chunks).toEqual(["Hel", "lo"]);
    });

    describe("vendor presets via baseURL", () => {
        it("uses no apiKey requirement for a local Ollama-style config", async () => {
            createMock.mockResolvedValue({ choices: [{ message: { content: "hi" } }], model: "llama3" });
            const provider = new OpenAiCompatibleProvider("ollama", {
                baseURL: "http://localhost:11434/v1",
                defaultModel: "llama3",
            });

            await provider.complete([{ role: "user", content: "hi" }]);

            expect(constructorSpy).toHaveBeenCalledWith(
                expect.objectContaining({ baseURL: "http://localhost:11434/v1" })
            );
        });

        it("forwards a custom baseURL for Groq/DeepSeek/OpenRouter-style configs", async () => {
            createMock.mockResolvedValue({ choices: [{ message: { content: "hi" } }], model: "mixtral" });
            const provider = new OpenAiCompatibleProvider("groq", {
                apiKey: "key",
                baseURL: "https://api.groq.com/openai/v1",
                defaultModel: "mixtral",
            });

            await provider.complete([{ role: "user", content: "hi" }]);

            expect(constructorSpy).toHaveBeenCalledWith(
                expect.objectContaining({ baseURL: "https://api.groq.com/openai/v1" })
            );
        });

        it("reports its own configured name, not a generic 'openai'", () => {
            const provider = new OpenAiCompatibleProvider("deepseek", { apiKey: "key", defaultModel: "deepseek-chat" });
            expect(provider.name).toBe("deepseek");
        });
    });
});

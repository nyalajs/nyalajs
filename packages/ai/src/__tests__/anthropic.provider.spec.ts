import { describe, it, expect, vi, beforeEach } from "vitest";
import { AnthropicProvider } from "../providers/anthropic.provider";

const { createMock, streamMock, constructorSpy } = vi.hoisted(() => ({
    createMock: vi.fn(),
    streamMock: vi.fn(),
    constructorSpy: vi.fn(),
}));

vi.mock("@anthropic-ai/sdk", () => ({
    default: class MockAnthropic {
        messages = { create: createMock, stream: streamMock };
        constructor(public config: any) {
            constructorSpy(config);
        }
    },
}));

describe("AnthropicProvider", () => {
    beforeEach(() => {
        createMock.mockReset();
        streamMock.mockReset();
        constructorSpy.mockReset();
    });

    it("moves system-role messages into the top-level `system` param, not the messages array", async () => {
        createMock.mockResolvedValue({
            content: [{ type: "text", text: "hi" }],
            model: "claude-sonnet-5",
        });
        const provider = new AnthropicProvider({ apiKey: "key" });

        await provider.complete([
            { role: "system", content: "You are helpful." },
            { role: "user", content: "Hello" },
        ]);

        const call = createMock.mock.calls[0][0];
        expect(call.system).toBe("You are helpful.");
        expect(call.messages).toEqual([{ role: "user", content: "Hello" }]);
    });

    it("joins multiple system messages with a blank line", async () => {
        createMock.mockResolvedValue({ content: [{ type: "text", text: "x" }], model: "m" });
        const provider = new AnthropicProvider({ apiKey: "key" });

        await provider.complete([
            { role: "system", content: "Rule one." },
            { role: "system", content: "Rule two." },
            { role: "user", content: "hi" },
        ]);

        expect(createMock.mock.calls[0][0].system).toBe("Rule one.\n\nRule two.");
    });

    it("omits `system` entirely when there are no system messages", async () => {
        createMock.mockResolvedValue({ content: [{ type: "text", text: "x" }], model: "m" });
        const provider = new AnthropicProvider({ apiKey: "key" });

        await provider.complete([{ role: "user", content: "hi" }]);

        expect(createMock.mock.calls[0][0].system).toBeUndefined();
    });

    it("concatenates only text content blocks, skipping tool_use blocks", async () => {
        createMock.mockResolvedValue({
            content: [
                { type: "text", text: "Part one. " },
                { type: "tool_use", id: "x", name: "lookup", input: {} },
                { type: "text", text: "Part two." },
            ],
            model: "m",
        });
        const provider = new AnthropicProvider({ apiKey: "key" });

        const result = await provider.complete([{ role: "user", content: "hi" }]);

        expect(result.text).toBe("Part one. Part two.");
    });

    it("maps usage from input_tokens/output_tokens to the canonical shape", async () => {
        createMock.mockResolvedValue({
            content: [{ type: "text", text: "x" }],
            model: "m",
            usage: { input_tokens: 10, output_tokens: 20 },
        });
        const provider = new AnthropicProvider({ apiKey: "key" });

        const result = await provider.complete([{ role: "user", content: "hi" }]);

        expect(result.usage).toEqual({ inputTokens: 10, outputTokens: 20 });
    });

    it("falls back to the default model when none is given", async () => {
        createMock.mockResolvedValue({ content: [{ type: "text", text: "x" }], model: "m" });
        const provider = new AnthropicProvider({ apiKey: "key" });

        await provider.complete([{ role: "user", content: "hi" }]);

        expect(createMock.mock.calls[0][0].model).toBe("claude-sonnet-5");
    });

    it("uses a configured defaultModel over the built-in fallback", async () => {
        createMock.mockResolvedValue({ content: [{ type: "text", text: "x" }], model: "m" });
        const provider = new AnthropicProvider({ apiKey: "key", defaultModel: "claude-haiku-4-5" });

        await provider.complete([{ role: "user", content: "hi" }]);

        expect(createMock.mock.calls[0][0].model).toBe("claude-haiku-4-5");
    });

    it("an explicit per-call model wins over both defaults", async () => {
        createMock.mockResolvedValue({ content: [{ type: "text", text: "x" }], model: "m" });
        const provider = new AnthropicProvider({ apiKey: "key", defaultModel: "claude-haiku-4-5" });

        await provider.complete([{ role: "user", content: "hi" }], { model: "claude-opus-5" });

        expect(createMock.mock.calls[0][0].model).toBe("claude-opus-5");
    });

    it("streams only text_delta content, ignoring other event types", async () => {
        streamMock.mockReturnValue(
            (async function* () {
                yield { type: "message_start" };
                yield { type: "content_block_delta", delta: { type: "text_delta", text: "Hel" } };
                yield { type: "content_block_delta", delta: { type: "text_delta", text: "lo" } };
                yield { type: "content_block_delta", delta: { type: "input_json_delta", partial_json: "{}" } };
                yield { type: "message_stop" };
            })()
        );
        const provider = new AnthropicProvider({ apiKey: "key" });

        const chunks: string[] = [];
        for await (const chunk of provider.stream([{ role: "user", content: "hi" }])) {
            chunks.push(chunk);
        }

        expect(chunks).toEqual(["Hel", "lo"]);
    });

    it("constructs the client with the configured apiKey", async () => {
        createMock.mockResolvedValue({ content: [{ type: "text", text: "x" }], model: "m" });
        const provider = new AnthropicProvider({ apiKey: "secret-key" });

        await provider.complete([{ role: "user", content: "hi" }]);

        expect(constructorSpy).toHaveBeenCalledWith(expect.objectContaining({ apiKey: "secret-key" }));
    });

    it("only constructs the underlying client once across multiple calls", async () => {
        createMock.mockResolvedValue({ content: [{ type: "text", text: "x" }], model: "m" });
        const provider = new AnthropicProvider({ apiKey: "key" });

        await provider.complete([{ role: "user", content: "hi" }]);
        await provider.complete([{ role: "user", content: "hi again" }]);

        expect(constructorSpy).toHaveBeenCalledTimes(1);
    });

    it("constructs the client with authToken instead of apiKey, when that's what's configured", async () => {
        createMock.mockResolvedValue({ content: [{ type: "text", text: "x" }], model: "m" });
        const provider = new AnthropicProvider({ authToken: "oauth-token-value" });

        await provider.complete([{ role: "user", content: "hi" }]);

        expect(constructorSpy).toHaveBeenCalledWith(
            expect.objectContaining({ authToken: "oauth-token-value", apiKey: undefined })
        );
    });

    it("passes both apiKey and authToken through untouched if a caller somehow sets both — the SDK itself decides precedence", async () => {
        createMock.mockResolvedValue({ content: [{ type: "text", text: "x" }], model: "m" });
        const provider = new AnthropicProvider({ apiKey: "key", authToken: "token" });

        await provider.complete([{ role: "user", content: "hi" }]);

        expect(constructorSpy).toHaveBeenCalledWith(expect.objectContaining({ apiKey: "key", authToken: "token" }));
    });
});

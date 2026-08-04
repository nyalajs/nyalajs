import { describe, it, expect, vi, beforeEach } from "vitest";
import { GeminiProvider } from "../providers/gemini.provider";

const { getGenerativeModelMock, startChatMock, sendMessageMock, sendMessageStreamMock, constructorSpy } = vi.hoisted(
    () => ({
        getGenerativeModelMock: vi.fn(),
        startChatMock: vi.fn(),
        sendMessageMock: vi.fn(),
        sendMessageStreamMock: vi.fn(),
        constructorSpy: vi.fn(),
    })
);

vi.mock("@google/generative-ai", () => ({
    GoogleGenerativeAI: class MockGoogleGenerativeAI {
        constructor(public apiKey: string) {
            constructorSpy(apiKey);
        }
        getGenerativeModel(params: any) {
            getGenerativeModelMock(params);
            return {
                startChat: (chatParams: any) => {
                    startChatMock(chatParams);
                    return { sendMessage: sendMessageMock, sendMessageStream: sendMessageStreamMock };
                },
            };
        }
    },
}));

describe("GeminiProvider", () => {
    beforeEach(() => {
        getGenerativeModelMock.mockReset();
        startChatMock.mockReset();
        sendMessageMock.mockReset();
        sendMessageStreamMock.mockReset();
        constructorSpy.mockReset();
    });

    it("passes system-role content as systemInstruction on the model, not in chat history", async () => {
        sendMessageMock.mockResolvedValue({ response: { text: () => "hi" } });
        const provider = new GeminiProvider({ apiKey: "key" });

        await provider.complete([
            { role: "system", content: "Be concise." },
            { role: "user", content: "Hello" },
        ]);

        expect(getGenerativeModelMock).toHaveBeenCalledWith(
            expect.objectContaining({ systemInstruction: "Be concise." })
        );
    });

    it('maps "assistant" role to Gemini\'s "model" role in history', async () => {
        sendMessageMock.mockResolvedValue({ response: { text: () => "hi" } });
        const provider = new GeminiProvider({ apiKey: "key" });

        await provider.complete([
            { role: "user", content: "Hi" },
            { role: "assistant", content: "Hello there" },
            { role: "user", content: "How are you?" },
        ]);

        const chatParams = startChatMock.mock.calls[0][0];
        expect(chatParams.history).toEqual([
            { role: "user", parts: [{ text: "Hi" }] },
            { role: "model", parts: [{ text: "Hello there" }] },
        ]);
    });

    it("sends the last message as the chat message, not as part of history", async () => {
        sendMessageMock.mockResolvedValue({ response: { text: () => "hi" } });
        const provider = new GeminiProvider({ apiKey: "key" });

        await provider.complete([{ role: "user", content: "Only message" }]);

        expect(startChatMock.mock.calls[0][0].history).toEqual([]);
        expect(sendMessageMock).toHaveBeenCalledWith("Only message");
    });

    it("maps usageMetadata to the canonical usage shape", async () => {
        sendMessageMock.mockResolvedValue({
            response: {
                text: () => "hi",
                usageMetadata: { promptTokenCount: 12, candidatesTokenCount: 8 },
            },
        });
        const provider = new GeminiProvider({ apiKey: "key" });

        const result = await provider.complete([{ role: "user", content: "hi" }]);

        expect(result.usage).toEqual({ inputTokens: 12, outputTokens: 8 });
    });

    it("falls back to the default model when none is given", async () => {
        sendMessageMock.mockResolvedValue({ response: { text: () => "hi" } });
        const provider = new GeminiProvider({ apiKey: "key" });

        await provider.complete([{ role: "user", content: "hi" }]);

        expect(getGenerativeModelMock).toHaveBeenCalledWith(expect.objectContaining({ model: "gemini-1.5-pro" }));
    });

    it("streams text from each chunk", async () => {
        sendMessageStreamMock.mockResolvedValue({
            stream: (async function* () {
                yield { text: () => "Hel" };
                yield { text: () => "lo" };
            })(),
        });
        const provider = new GeminiProvider({ apiKey: "key" });

        const chunks: string[] = [];
        for await (const chunk of provider.stream([{ role: "user", content: "hi" }])) {
            chunks.push(chunk);
        }

        expect(chunks).toEqual(["Hel", "lo"]);
    });

    it("constructs the client with the configured apiKey", async () => {
        sendMessageMock.mockResolvedValue({ response: { text: () => "hi" } });
        const provider = new GeminiProvider({ apiKey: "secret-key" });

        await provider.complete([{ role: "user", content: "hi" }]);

        expect(constructorSpy).toHaveBeenCalledWith("secret-key");
    });
});

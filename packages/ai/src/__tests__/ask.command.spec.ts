import { describe, it, expect, vi } from "vitest";
import { AskCommand } from "../cli/ask.command";
import { AiService } from "../ai.service";
import { FrameworkKnowledge } from "../knowledge/framework-knowledge";

function fakeAiService(chunks: string[]) {
    const service = Object.create(AiService.prototype) as AiService;
    (service as any).stream = vi.fn().mockReturnValue(
        (async function* () {
            for (const chunk of chunks) yield chunk;
        })()
    );
    return service;
}

describe("AskCommand", () => {
    it("includes FrameworkKnowledge conventions in the system prompt", () => {
        const aiService = fakeAiService([]);
        const command = new AskCommand({ aiService });

        const messages = command.buildMessages("What is TenantContext?");

        expect(messages[0].role).toBe("system");
        expect(messages[0].content).toContain("TenantContext");
        expect(messages[0].content).toContain(new FrameworkKnowledge().getTenancyConventions());
    });

    it("passes the question through as the user message, unmodified", () => {
        const command = new AskCommand({ aiService: fakeAiService([]) });
        const messages = command.buildMessages("How do I register a controller?");

        expect(messages[1]).toEqual({ role: "user", content: "How do I register a controller?" });
    });

    it("streams the AI response chunks to stdout", async () => {
        const aiService = fakeAiService(["Hello", ", ", "world!"]);
        const command = new AskCommand({ aiService });
        const writes: string[] = [];
        const spy = vi.spyOn(process.stdout, "write").mockImplementation((chunk: any) => {
            writes.push(chunk.toString());
            return true;
        });

        await command.run("test question");
        spy.mockRestore();

        expect(writes.join("")).toBe("Hello, world!\n");
    });
});

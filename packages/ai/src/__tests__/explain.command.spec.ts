import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "fs-extra";
import * as path from "path";
import * as os from "os";
import { ExplainCommand } from "../cli/explain.command";
import { AiService } from "../ai.service";

function fakeAiService(chunks: string[]) {
    const service = Object.create(AiService.prototype) as AiService;
    (service as any).stream = vi.fn().mockReturnValue(
        (async function* () {
            for (const chunk of chunks) yield chunk;
        })()
    );
    return service;
}

describe("ExplainCommand", () => {
    let tmpDir: string;

    beforeEach(async () => {
        tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "nyala-explain-"));
    });

    afterEach(async () => {
        await fs.remove(tmpDir);
    });

    it("includes the real file content in the prompt", async () => {
        await fs.writeFile(
            path.join(tmpDir, "widget.controller.ts"),
            "export class WidgetController {}"
        );
        const command = new ExplainCommand({ cwd: tmpDir, aiService: fakeAiService([]) });

        const messages = await command.buildMessages("widget.controller.ts");

        expect(messages[1].content).toContain("export class WidgetController {}");
        expect(messages[1].content).toContain("widget.controller.ts");
    });

    it("refuses to read a secret-shaped file, even if explicitly requested", async () => {
        await fs.writeFile(path.join(tmpDir, ".env"), "DB_PASSWORD=supersecret");
        const command = new ExplainCommand({ cwd: tmpDir, aiService: fakeAiService([]) });

        await expect(command.buildMessages(".env")).rejects.toThrow(/Refusing to read/);
    });

    it("redacts a secret embedded in an otherwise-readable file before it reaches the prompt", async () => {
        await fs.writeFile(
            path.join(tmpDir, "config.ts"),
            'export const apiKey = "sk-abcdefghijklmnopqrstuvwxyz123456";'
        );
        const command = new ExplainCommand({ cwd: tmpDir, aiService: fakeAiService([]) });

        const messages = await command.buildMessages("config.ts");

        expect(messages[1].content).toContain("[REDACTED:api-key]");
        expect(messages[1].content).not.toContain("abcdefghijklmnop");
    });

    it("streams the response to stdout", async () => {
        await fs.writeFile(path.join(tmpDir, "a.ts"), "export const a = 1;");
        const command = new ExplainCommand({ cwd: tmpDir, aiService: fakeAiService(["It ", "does X."]) });

        const writes: string[] = [];
        const spy = vi.spyOn(process.stdout, "write").mockImplementation((chunk: any) => {
            writes.push(chunk.toString());
            return true;
        });

        await command.run("a.ts");
        spy.mockRestore();

        expect(writes.join("")).toBe("It does X.\n");
    });
});

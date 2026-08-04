import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "fs-extra";
import * as path from "path";
import * as os from "os";
import { execSync } from "child_process";
import { ReviewCommand } from "../cli/review.command";
import { AiService } from "../ai.service";

function fakeAiService(chunks: string[]) {
    const service = Object.create(AiService.prototype) as AiService;
    (service as any).stream = vi.fn().mockReturnValue(
        (async function* () {
            for (const chunk of chunks) yield chunk;
        })()
    );
    return { service, streamSpy: (service as any).stream as ReturnType<typeof vi.fn> };
}

function git(cwd: string, args: string): void {
    execSync(`git ${args}`, { cwd, stdio: "pipe" });
}

describe("ReviewCommand", () => {
    let repo: string;

    beforeEach(async () => {
        repo = await fs.mkdtemp(path.join(os.tmpdir(), "nyala-review-"));
        git(repo, "init -q");
        git(repo, 'config user.email "test@example.com"');
        git(repo, 'config user.name "Test"');
        await fs.writeFile(path.join(repo, "widget.controller.ts"), "export class WidgetController {}\n");
        git(repo, "add .");
        git(repo, '-c commit.gpgsign=false commit -q -m initial');
    });

    afterEach(async () => {
        await fs.remove(repo);
    });

    it("getDiff() reflects a real uncommitted change against HEAD", async () => {
        await fs.writeFile(
            path.join(repo, "widget.controller.ts"),
            "export class WidgetController {\n  index() {}\n}\n"
        );
        const { service } = fakeAiService([]);
        const command = new ReviewCommand({ cwd: repo, aiService: service });

        const diff = command.getDiff();

        expect(diff).toContain("widget.controller.ts");
        expect(diff).toContain("+  index() {}");
    });

    it("getDiff() is empty with no uncommitted changes", () => {
        const { service } = fakeAiService([]);
        const command = new ReviewCommand({ cwd: repo, aiService: service });

        expect(command.getDiff().trim()).toBe("");
    });

    it("run() reports 'no changes' and never calls the AI provider when the tree is clean", async () => {
        const { service, streamSpy } = fakeAiService([]);
        const command = new ReviewCommand({ cwd: repo, aiService: service });
        const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

        await command.run();

        expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("No uncommitted changes"));
        expect(streamSpy).not.toHaveBeenCalled();
        logSpy.mockRestore();
    });

    it("redacts a secret that shows up in the diff before it reaches the prompt", async () => {
        await fs.writeFile(path.join(repo, "widget.controller.ts"), 'const apiKey = "sk-abcdefghijklmnopqrstuvwxyz123456";\n');
        const { service } = fakeAiService([]);
        const command = new ReviewCommand({ cwd: repo, aiService: service });

        const messages = command.buildMessages(command.getDiff());

        expect(messages[1].content).toContain("[REDACTED:api-key]");
        expect(messages[1].content).not.toContain("abcdefghijklmnop");
    });

    it("streams the review to stdout when there is a diff", async () => {
        await fs.writeFile(path.join(repo, "widget.controller.ts"), "export class WidgetController {\n  x() {}\n}\n");
        const { service } = fakeAiService(["Looks ", "good."]);
        const command = new ReviewCommand({ cwd: repo, aiService: service });

        const writes: string[] = [];
        const spy = vi.spyOn(process.stdout, "write").mockImplementation((chunk: any) => {
            writes.push(chunk.toString());
            return true;
        });

        await command.run();
        spy.mockRestore();

        expect(writes.join("")).toBe("Looks good.\n");
    });

    it("the system prompt frames framework-convention violations as more serious than style issues", async () => {
        await fs.writeFile(path.join(repo, "widget.controller.ts"), "export class WidgetController {\n  x() {}\n}\n");
        const { service } = fakeAiService([]);
        const command = new ReviewCommand({ cwd: repo, aiService: service });

        const messages = command.buildMessages(command.getDiff());

        expect(messages[0].content).toContain("more serious finding");
    });
});

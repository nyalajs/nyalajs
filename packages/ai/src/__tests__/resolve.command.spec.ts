import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "fs-extra";
import * as path from "path";
import * as os from "os";
import { execSync } from "child_process";
import { ResolveCommand } from "../cli/resolve.command";
import { AiService } from "../ai.service";
import { WorktreeManager } from "../agent/worktree-manager";
import { FileTranscriptStore } from "../memory/file-transcript-store";
import { TranscriptStore } from "../memory/transcript-store";

function git(cwd: string, args: string): void {
    execSync(`git ${args}`, { cwd, stdio: "pipe" });
}

function fakeAiService(responses: string[]) {
    const service = Object.create(AiService.prototype) as AiService;
    let call = 0;
    (service as any).complete = vi.fn().mockImplementation(async () => ({
        text: responses[call++],
        model: "fake",
    }));
    return service;
}

function jsonAction(action: unknown): string {
    return "```json\n" + JSON.stringify(action) + "\n```";
}

describe("ResolveCommand — end-to-end against a real git repo", () => {
    let repo: string;
    let transcriptsDir: string;
    let transcripts: TranscriptStore;

    beforeEach(async () => {
        repo = await fs.mkdtemp(path.join(os.tmpdir(), "nyala-resolve-e2e-"));
        transcriptsDir = await fs.mkdtemp(path.join(os.tmpdir(), "nyala-resolve-transcripts-"));
        transcripts = new FileTranscriptStore(transcriptsDir);
        git(repo, "init -q");
        git(repo, 'config user.email "test@example.com"');
        git(repo, 'config user.name "Test"');
        await fs.writeFile(
            path.join(repo, "buggy.controller.ts"),
            "export class BuggyController {\n  index() { return undefined; }\n}\n"
        );
        git(repo, "add .");
        git(repo, "-c commit.gpgsign=false commit -q -m initial");
    });

    afterEach(async () => {
        try {
            execSync("git worktree prune", { cwd: repo, stdio: "pipe" });
        } catch {
            // ignore
        }
        await fs.remove(repo);
        await fs.remove(transcriptsDir);
    });

    it("the developer's real repo is never touched — only the isolated worktree changes", async () => {
        const aiService = fakeAiService([
            jsonAction({ type: "read_file", args: { path: "buggy.controller.ts" } }),
            jsonAction({
                type: "write_file",
                args: {
                    path: "buggy.controller.ts",
                    content: "export class BuggyController {\n  index() { return { ok: true }; }\n}\n",
                },
            }),
            jsonAction({ type: "run_command", args: { command: "cat buggy.controller.ts" } }),
            jsonAction({ type: "done", summary: "Fixed BuggyController.index() to return a real value." }),
        ]);

        const command = new ResolveCommand({ cwd: repo, aiService, worktrees: new WorktreeManager(repo), transcripts });
        const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

        await command.run("index() returns undefined instead of a real response");
        logSpy.mockRestore();

        // The real repo's file is completely untouched.
        const originalContent = await fs.readFile(path.join(repo, "buggy.controller.ts"), "utf-8");
        expect(originalContent).toContain("return undefined;");

        // But the branch the agent created does have the fix. Branches checked
        // out in another worktree are marked with "+" (not "*") by `git branch`.
        const branches = execSync("git branch --list nyala-fix-*", { cwd: repo, encoding: "utf-8" });
        const branchName = branches.trim().replace(/^[*+]?\s*/, "");
        expect(branchName).toMatch(/^nyala-fix-/);

        const fixedContent = execSync(`git show ${branchName}:buggy.controller.ts`, { cwd: repo, encoding: "utf-8" });
        expect(fixedContent).toContain("return { ok: true };");
    });

    it("prints the diff stat and merge instructions on success", async () => {
        const aiService = fakeAiService([
            jsonAction({ type: "write_file", args: { path: "fixed.ts", content: "export const fixed = true;\n" } }),
            jsonAction({ type: "done", summary: "Added the fix." }),
        ]);
        const command = new ResolveCommand({ cwd: repo, aiService, worktrees: new WorktreeManager(repo), transcripts });

        const logs: string[] = [];
        const logSpy = vi.spyOn(console, "log").mockImplementation((msg: any) => {
            logs.push(String(msg));
        });

        await command.run("add a fix");
        logSpy.mockRestore();

        const output = logs.join("\n");
        expect(output).toContain("fixed.ts");
        expect(output).toMatch(/git merge nyala-fix-/);
    });

    it("cleans up the worktree when the agent makes no changes", async () => {
        const aiService = fakeAiService([jsonAction({ type: "done", summary: "Nothing needed fixing." })]);
        const worktrees = new WorktreeManager(repo);
        const command = new ResolveCommand({ cwd: repo, aiService, worktrees, transcripts });
        vi.spyOn(console, "log").mockImplementation(() => undefined);

        await command.run("a non-issue");

        vi.restoreAllMocks();
        // No leftover nyala-fix-* worktree directories should remain registered.
        const worktreeList = execSync("git worktree list", { cwd: repo, encoding: "utf-8" });
        expect(worktreeList.trim().split("\n")).toHaveLength(1); // just the main repo
    });

    it("preserves partial work on failure instead of discarding it", async () => {
        const aiService = fakeAiService([
            jsonAction({ type: "write_file", args: { path: "partial.ts", content: "export const partial = true;" } }),
            "not valid json at all",
        ]);
        const worktrees = new WorktreeManager(repo);
        const command = new ResolveCommand({ cwd: repo, aiService, worktrees, transcripts });
        vi.spyOn(console, "log").mockImplementation(() => undefined);
        vi.spyOn(console, "error").mockImplementation(() => undefined);

        await expect(command.run("an issue that trips up the agent")).rejects.toThrow();
        vi.restoreAllMocks();

        const worktreeList = execSync("git worktree list --porcelain", { cwd: repo, encoding: "utf-8" });
        const worktreePathMatch = worktreeList.match(/worktree (.*nyala-resolve-nyala-fix-\S+)/);
        expect(worktreePathMatch).toBeTruthy();

        const partialFile = path.join(worktreePathMatch![1], "partial.ts");
        expect(await fs.pathExists(partialFile)).toBe(true);

        // Manual cleanup since this test intentionally leaves the worktree behind.
        worktrees.remove(worktreePathMatch![1]);
    });

    it("SIGINT aborts the run cleanly, preserving only what was written before the signal", async () => {
        const aiService = fakeAiService([
            jsonAction({ type: "write_file", args: { path: "partial.ts", content: "x" } }),
            jsonAction({ type: "write_file", args: { path: "should-not-exist.ts", content: "y" } }),
            jsonAction({ type: "done", summary: "done" }),
        ]);
        const worktrees = new WorktreeManager(repo);
        const command = new ResolveCommand({ cwd: repo, aiService, worktrees, transcripts });
        vi.spyOn(console, "log").mockImplementation(() => undefined);
        vi.spyOn(console, "error").mockImplementation(() => undefined);

        await expect(
            command.run("issue", {
                // Simulates the user hitting Ctrl+C right after the first step completes.
                onIteration: () => process.emit("SIGINT"),
            })
        ).rejects.toThrow(/aborted/i);
        vi.restoreAllMocks();

        const worktreeList = execSync("git worktree list --porcelain", { cwd: repo, encoding: "utf-8" });
        const worktreePathMatch = worktreeList.match(/worktree (.*nyala-resolve-nyala-fix-\S+)/);
        expect(worktreePathMatch).toBeTruthy();

        expect(await fs.pathExists(path.join(worktreePathMatch![1], "partial.ts"))).toBe(true);
        expect(await fs.pathExists(path.join(worktreePathMatch![1], "should-not-exist.ts"))).toBe(false);

        worktrees.remove(worktreePathMatch![1]);
    });
});

describe("ResolveCommand — transcript persistence and usage reporting", () => {
    let repo: string;
    let transcriptsDir: string;

    beforeEach(async () => {
        repo = await fs.mkdtemp(path.join(os.tmpdir(), "nyala-resolve-memory-"));
        transcriptsDir = await fs.mkdtemp(path.join(os.tmpdir(), "nyala-resolve-transcripts-"));
        git(repo, "init -q");
        git(repo, 'config user.email "test@example.com"');
        git(repo, 'config user.name "Test"');
        await fs.writeFile(path.join(repo, "a.ts"), "export const a = 1;\n");
        git(repo, "add .");
        git(repo, "-c commit.gpgsign=false commit -q -m initial");
    });

    afterEach(async () => {
        try {
            execSync("git worktree prune", { cwd: repo, stdio: "pipe" });
        } catch {
            // ignore
        }
        await fs.remove(repo);
        await fs.remove(transcriptsDir);
    });

    it("saves the transcript after a successful run, keyed by the branch name", async () => {
        const aiService = fakeAiService([jsonAction({ type: "done", summary: "Nothing to fix." })]);
        const transcripts = new FileTranscriptStore(transcriptsDir);
        const command = new ResolveCommand({ cwd: repo, aiService, worktrees: new WorktreeManager(repo), transcripts });
        vi.spyOn(console, "log").mockImplementation(() => undefined);

        await command.run("issue");
        vi.restoreAllMocks();

        const runIds = await transcripts.list();
        expect(runIds).toHaveLength(1);
        expect(runIds[0]).toMatch(/^nyala-fix-/);

        const saved = await transcripts.load(runIds[0]);
        expect(saved![0].role).toBe("system");
        expect(saved![1]).toEqual({ role: "user", content: "Fix this issue: issue" });
    });

    it("does not save a transcript when the run fails before finishing", async () => {
        const aiService = fakeAiService(["not valid json"]);
        const transcripts = new FileTranscriptStore(transcriptsDir);
        const command = new ResolveCommand({
            cwd: repo,
            aiService,
            worktrees: new WorktreeManager(repo),
            transcripts,
        });
        vi.spyOn(console, "log").mockImplementation(() => undefined);
        vi.spyOn(console, "error").mockImplementation(() => undefined);

        await expect(command.run("issue")).rejects.toThrow();
        vi.restoreAllMocks();

        expect(await transcripts.list()).toEqual([]);
    });

    it("prints a usage summary when the provider reports token usage", async () => {
        const service = Object.create(AiService.prototype) as AiService;
        (service as any).complete = vi.fn().mockResolvedValue({
            text: jsonAction({ type: "done", summary: "done" }),
            model: "fake",
            usage: { inputTokens: 100, outputTokens: 20 },
        });
        const command = new ResolveCommand({
            cwd: repo,
            aiService: service,
            worktrees: new WorktreeManager(repo),
            transcripts: new FileTranscriptStore(transcriptsDir),
        });

        const logs: string[] = [];
        vi.spyOn(console, "log").mockImplementation((msg: any) => logs.push(String(msg)));
        await command.run("issue");
        vi.restoreAllMocks();

        expect(logs.join("\n")).toContain("100 input tokens, 20 output tokens");
    });

    it("prints no usage line when the provider never reports usage", async () => {
        const aiService = fakeAiService([jsonAction({ type: "done", summary: "done" })]);
        const command = new ResolveCommand({
            cwd: repo,
            aiService,
            worktrees: new WorktreeManager(repo),
            transcripts: new FileTranscriptStore(transcriptsDir),
        });

        const logs: string[] = [];
        vi.spyOn(console, "log").mockImplementation((msg: any) => logs.push(String(msg)));
        await command.run("issue");
        vi.restoreAllMocks();

        expect(logs.join("\n")).not.toContain("tokens");
    });

    it("prints one progress line per iteration, including the final 'done' one", async () => {
        const aiService = fakeAiService([
            jsonAction({ type: "run_command", args: { command: "true" } }),
            jsonAction({ type: "done", summary: "done" }),
        ]);
        const command = new ResolveCommand({
            cwd: repo,
            aiService,
            worktrees: new WorktreeManager(repo),
            transcripts: new FileTranscriptStore(transcriptsDir),
        });

        const logs: string[] = [];
        vi.spyOn(console, "log").mockImplementation((msg: any) => logs.push(String(msg)));
        await command.run("issue");
        vi.restoreAllMocks();

        const output = logs.join("\n");
        expect(output).toContain("[1] run_command");
        expect(output).toContain("[2] done");
    });
});

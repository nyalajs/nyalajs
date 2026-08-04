import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs-extra";
import * as path from "path";
import * as os from "os";
import { execSync } from "child_process";
import { WorktreeManager } from "../agent/worktree-manager";

function git(cwd: string, args: string): void {
    execSync(`git ${args}`, { cwd, stdio: "pipe" });
}

describe("WorktreeManager", () => {
    let repo: string;

    beforeEach(async () => {
        repo = await fs.mkdtemp(path.join(os.tmpdir(), "nyala-worktree-"));
        git(repo, "init -q");
        git(repo, 'config user.email "test@example.com"');
        git(repo, 'config user.name "Test"');
        await fs.writeFile(path.join(repo, "README.md"), "hello\n");
        git(repo, "add .");
        git(repo, "-c commit.gpgsign=false commit -q -m initial");
    });

    afterEach(async () => {
        // Best-effort: some worktrees may already have been removed by the test itself.
        try {
            execSync("git worktree prune", { cwd: repo, stdio: "pipe" });
        } catch {
            // ignore
        }
        await fs.remove(repo);
    });

    it("create() produces a real, independent working directory on a new branch", async () => {
        const worktrees = new WorktreeManager(repo);
        const worktreePath = await worktrees.create("nyala-fix-test-1");

        expect(await fs.pathExists(worktreePath)).toBe(true);
        expect(await fs.pathExists(path.join(worktreePath, "README.md"))).toBe(true);

        const branch = execSync("git rev-parse --abbrev-ref HEAD", { cwd: worktreePath, encoding: "utf-8" }).trim();
        expect(branch).toBe("nyala-fix-test-1");

        worktrees.remove(worktreePath);
    });

    it("changes made in the worktree do not appear in the original repo", async () => {
        const worktrees = new WorktreeManager(repo);
        const worktreePath = await worktrees.create("nyala-fix-test-2");

        await fs.writeFile(path.join(worktreePath, "new-file.ts"), "export const x = 1;");

        expect(await fs.pathExists(path.join(repo, "new-file.ts"))).toBe(false);

        worktrees.remove(worktreePath);
    });

    it("hasChanges() is false for a freshly created worktree", async () => {
        const worktrees = new WorktreeManager(repo);
        const worktreePath = await worktrees.create("nyala-fix-test-3");

        expect(worktrees.hasChanges(worktreePath)).toBe(false);

        worktrees.remove(worktreePath);
    });

    it("hasChanges() is true after a new (untracked) file is written", async () => {
        const worktrees = new WorktreeManager(repo);
        const worktreePath = await worktrees.create("nyala-fix-test-4");

        await fs.writeFile(path.join(worktreePath, "new-file.ts"), "export const x = 1;");

        expect(worktrees.hasChanges(worktreePath)).toBe(true);

        worktrees.remove(worktreePath);
    });

    it("getDiffStat() includes brand-new untracked files, not just modifications to tracked ones", async () => {
        const worktrees = new WorktreeManager(repo);
        const worktreePath = await worktrees.create("nyala-fix-test-5");

        await fs.writeFile(path.join(worktreePath, "brand-new.ts"), "export const x = 1;\n");

        const stat = worktrees.getDiffStat(worktreePath);

        expect(stat).toContain("brand-new.ts");

        worktrees.remove(worktreePath);
    });

    it("commitAll() commits staged and untracked changes onto the worktree's branch", async () => {
        const worktrees = new WorktreeManager(repo);
        const worktreePath = await worktrees.create("nyala-fix-test-commit-1");
        await fs.writeFile(path.join(worktreePath, "new-file.ts"), "export const x = 1;\n");

        const committed = worktrees.commitAll(worktreePath, "nyala resolve: add new-file.ts");

        expect(committed).toBe(true);
        const log = execSync("git log --oneline -1", { cwd: worktreePath, encoding: "utf-8" });
        expect(log).toContain("nyala resolve: add new-file.ts");
        expect(worktrees.hasChanges(worktreePath)).toBe(false);

        worktrees.remove(worktreePath);
    });

    it("commitAll() returns false when there is nothing to commit", async () => {
        const worktrees = new WorktreeManager(repo);
        const worktreePath = await worktrees.create("nyala-fix-test-commit-2");

        const committed = worktrees.commitAll(worktreePath, "nothing to commit");

        expect(committed).toBe(false);

        worktrees.remove(worktreePath);
    });

    it("a change committed via commitAll() is visible through `git show <branch>:<file>`", async () => {
        const worktrees = new WorktreeManager(repo);
        const worktreePath = await worktrees.create("nyala-fix-test-commit-3");
        await fs.writeFile(path.join(worktreePath, "README.md"), "updated\n");

        worktrees.commitAll(worktreePath, "update readme");

        const shown = execSync("git show nyala-fix-test-commit-3:README.md", { cwd: repo, encoding: "utf-8" });
        expect(shown.trim()).toBe("updated");

        worktrees.remove(worktreePath);
    });

    it("remove() actually removes the worktree directory", async () => {
        const worktrees = new WorktreeManager(repo);
        const worktreePath = await worktrees.create("nyala-fix-test-6");

        worktrees.remove(worktreePath);

        expect(await fs.pathExists(worktreePath)).toBe(false);
    });

    it("throws a clear error if the repo root isn't actually a git repository", async () => {
        const notARepo = await fs.mkdtemp(path.join(os.tmpdir(), "nyala-not-a-repo-"));
        try {
            const worktrees = new WorktreeManager(notARepo);
            await expect(worktrees.create("nyala-fix-test-7")).rejects.toThrow(/Failed to create git worktree/);
        } finally {
            await fs.remove(notARepo);
        }
    });
});

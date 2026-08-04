import * as os from "os";
import * as path from "path";
import { spawnSync } from "child_process";

/**
 * The safety boundary for the agentic resolve loop: every change it makes
 * happens on a new branch in an isolated git worktree, never the developer's
 * real working tree — the same isolation model the "worktree" mode of the
 * Agent tool itself uses. Nothing here is visible outside the worktree
 * until the developer explicitly reviews and merges it.
 */
export class WorktreeManager {
    constructor(private readonly repoRoot: string) {}

    async create(branchName: string): Promise<string> {
        const worktreePath = path.join(os.tmpdir(), `nyala-resolve-${branchName}`);

        const result = spawnSync("git", ["worktree", "add", "-b", branchName, worktreePath], {
            cwd: this.repoRoot,
            encoding: "utf-8",
        });

        if (result.status !== 0) {
            throw new Error(`[nyala/ai] Failed to create git worktree: ${result.stderr || result.error?.message}`);
        }

        return worktreePath;
    }

    /** Removes the worktree (and, with force, any uncommitted changes in it) — does NOT delete the branch. */
    remove(worktreePath: string): void {
        spawnSync("git", ["worktree", "remove", "--force", worktreePath], { cwd: this.repoRoot });
    }

    /**
     * Stages everything first (safe here — this is the isolated worktree,
     * not the developer's real tree) so brand-new files the agent created
     * show up too; plain `git diff --stat HEAD` only shows modifications
     * to already-tracked files, silently omitting new ones.
     */
    getDiffStat(worktreePath: string): string {
        spawnSync("git", ["add", "-A"], { cwd: worktreePath });
        const result = spawnSync("git", ["diff", "--stat", "--cached", "HEAD"], { cwd: worktreePath, encoding: "utf-8" });
        return result.stdout ?? "";
    }

    hasChanges(worktreePath: string): boolean {
        const result = spawnSync("git", ["status", "--porcelain"], { cwd: worktreePath, encoding: "utf-8" });
        return (result.stdout ?? "").trim().length > 0;
    }

    /**
     * Stages everything and commits it on the worktree's branch. Without
     * this, the agent's changes exist only as uncommitted working-tree
     * state — `git merge <branch>` would have nothing to merge, since
     * nothing was ever committed to that branch. Uses the caller's own git
     * config (commit signing etc.) rather than overriding it. Returns
     * false if there was nothing to commit.
     */
    commitAll(worktreePath: string, message: string): boolean {
        spawnSync("git", ["add", "-A"], { cwd: worktreePath });
        const result = spawnSync("git", ["commit", "-m", message], { cwd: worktreePath, encoding: "utf-8" });
        return result.status === 0;
    }
}

import { Injectable } from "@nyalajs/core";
import * as fs from "fs-extra";
import * as path from "path";
import { spawnSync } from "child_process";
import { ProjectStructure } from "./types";

export interface ProjectContextOptions {
    cwd?: string;
    /** Relative to cwd. Defaults to bootstrap/app.module.ts, matching every starter template. */
    appModulePath?: string;
    timeoutMs?: number;
}

/**
 * The reusable "what does this project actually look like" service other
 * AI features (and, eventually, docs generation / diagnostics / IDE
 * tooling) draw from — one real introspection pass instead of every
 * feature re-scanning the project itself.
 *
 * Gets its data by booting the project's actual Kernel in a subprocess
 * (runtime/introspect-module-graph.ts, run via `npx tsx` from the
 * project's own directory) rather than approximating it via regex/file
 * scanning — the same reasoning and mechanism @nyalajs/cli's
 * migrate.command.ts already uses to run project-owned TS files under the
 * project's own tsconfig/node_modules.
 */
@Injectable()
export class ProjectContextService {
    private cached?: ProjectStructure;

    async getStructure(options: ProjectContextOptions = {}): Promise<ProjectStructure> {
        if (this.cached) return this.cached;

        const cwd = options.cwd ?? process.cwd();
        const appModulePath = path.join(cwd, options.appModulePath ?? "bootstrap/app.module.ts");

        if (!(await fs.pathExists(appModulePath))) {
            throw new Error(
                `[nyala/ai] No root module found at ${appModulePath}. Pass appModulePath if this project doesn't follow the standard bootstrap/app.module.ts convention.`
            );
        }

        const runnerPath = path.join(__dirname, "../../runtime/introspect-module-graph.ts");

        const result = spawnSync("npx", ["tsx", runnerPath], {
            cwd,
            timeout: options.timeoutMs ?? 30_000,
            env: { ...process.env, NYALA_AI_APP_MODULE_PATH: appModulePath },
            encoding: "utf-8",
        });

        if (result.error) {
            throw new Error(`[nyala/ai] Failed to introspect the project's module graph: ${result.error.message}`);
        }
        if (result.status !== 0) {
            throw new Error(`[nyala/ai] Failed to boot the project to introspect it: ${this.extractError(result.stderr)}`);
        }

        const structure = JSON.parse(result.stdout) as ProjectStructure;
        this.cached = structure;
        return structure;
    }

    private extractError(stderr: string): string {
        const trimmed = stderr?.trim();
        if (!trimmed) return "unknown error";
        try {
            return JSON.parse(trimmed).error ?? trimmed;
        } catch {
            return trimmed;
        }
    }

    /** Drop the cached structure — call after files change (e.g. between agent loop iterations). */
    invalidate(): void {
        this.cached = undefined;
    }
}

import * as path from "path";
import * as fs from "fs-extra";
import chalk from "chalk";
import { spawn, ChildProcess } from "child_process";

/**
 * Starts a real Vite dev server as a child process for apps that have a
 * vite.config.ts — the Inertia starter's frontend build tool (see
 * docs/inertia-starter-spec.md §4). No-op — not even a warning — for apps
 * that don't have that file, same convention BuildIslandsCommand uses for
 * app/islands/manifest.ts, so this never affects non-Inertia templates.
 *
 * Per the spec's resolved Open Question #2: the dev-mode HTML shell points
 * AT this dev server directly (http://localhost:<port>/@vite/client + the
 * entry script) — exactly how Laravel's @vite() directive works — rather
 * than proxying requests through Fastify. This command's only job is to
 * get Vite's own dev server running and stay out of the request path.
 */
export class ViteDevCommand {
    /**
     * @param cwd Project root to look for vite.config.ts in and run `vite`
     * from. Defaults to process.cwd() — constructor-injectable (same
     * pattern as GenerateCommand(tmpDir)) so tests don't need to
     * process.chdir(), which vitest workers don't support.
     */
    constructor(private readonly cwd: string = process.cwd()) {}

    /**
     * Starts `vite` in dev mode as a detached background process (like
     * BuildIslandsCommand's watch mode) — non-blocking, since `nyala dev`
     * still needs to go on to start tsc-watch afterward. Returns the child
     * process (or null if there's no vite.config.ts) so the caller can
     * make sure it's killed when the parent exits.
     */
    async start(port: number = 5173): Promise<ChildProcess | null> {
        const configPath = await this.findConfig();
        if (!configPath) {
            return null;
        }

        console.log(chalk.cyan(`\nStarting Vite dev server on port ${port}...`));

        const child = spawn("npx", ["vite", "--port", String(port), "--strictPort"], {
            stdio: "inherit",
            cwd: this.cwd,
            env: { ...process.env, NYALA_VITE_DEV: "true" },
        });

        child.on("error", (error) => {
            console.error(chalk.red("Failed to start Vite dev server:"), error.message);
        });

        return child;
    }

    private async findConfig(): Promise<string | null> {
        for (const name of ["vite.config.ts", "vite.config.js", "vite.config.mjs"]) {
            const candidate = path.join(this.cwd, name);
            if (await fs.pathExists(candidate)) {
                return candidate;
            }
        }
        return null;
    }
}

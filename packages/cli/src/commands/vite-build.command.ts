import * as path from "path";
import * as fs from "fs-extra";
import chalk from "chalk";
import { spawnSync } from "child_process";

export interface ViteBuildOptions {
    /**
     * Also build the SSR entry (app/ssr.tsx) if one exists, via
     * `vite build --ssr`. Off by default — SSR is opt-in per
     * docs/inertia-starter-spec.md's resolved Open Question #3, so a plain
     * `nyala build` never builds it unless asked.
     */
    ssr?: boolean;
}

/**
 * Runs `vite build` (the real Vite CLI, via npx) for apps that have a
 * vite.config.ts, producing dist/.vite/manifest.json + hashed assets that
 * AssetVersionResolver (packages/inertia/src/asset-version.ts) reads in
 * production. No-op for apps without a vite.config.ts — same
 * no-op-if-absent convention as BuildIslandsCommand/ViteDevCommand.
 */
export class ViteBuildCommand {
    /**
     * @param cwd Project root to look for vite.config.ts/app/ssr.tsx in and
     * run `vite build` from. Defaults to process.cwd() — constructor-
     * injectable so tests don't need to process.chdir(), which vitest
     * workers don't support.
     */
    constructor(private readonly cwd: string = process.cwd()) {}

    async handle(options: ViteBuildOptions = {}): Promise<void> {
        const configPath = await this.findConfig();
        if (!configPath) {
            return;
        }

        console.log(chalk.cyan("\nBuilding frontend assets (vite build)..."));

        const result = spawnSync("npx", ["vite", "build"], {
            stdio: "inherit",
            cwd: this.cwd,
        });

        if (result.status !== 0) {
            console.error(chalk.red("Vite build failed"));
            process.exit(result.status ?? 1);
        }

        if (options.ssr) {
            await this.buildSsrEntry();
        }
    }

    private async buildSsrEntry(): Promise<void> {
        const ssrEntry = await this.findSsrEntry();
        if (!ssrEntry) {
            console.warn(
                chalk.yellow(
                    "\n--ssr was passed but no app/ssr.tsx (or .ts/.jsx/.js) entry was found — skipping SSR build."
                )
            );
            return;
        }

        console.log(chalk.cyan(`\nBuilding SSR entry (${path.relative(this.cwd, ssrEntry)})...`));

        const result = spawnSync(
            "npx",
            ["vite", "build", "--ssr", ssrEntry, "--outDir", "dist/ssr"],
            { stdio: "inherit", cwd: this.cwd }
        );

        if (result.status !== 0) {
            console.error(chalk.red("SSR build failed"));
            process.exit(result.status ?? 1);
        }
    }

    private async findSsrEntry(): Promise<string | null> {
        for (const name of ["app/ssr.tsx", "app/ssr.ts", "app/ssr.jsx", "app/ssr.js"]) {
            const candidate = path.join(this.cwd, name);
            if (await fs.pathExists(candidate)) {
                return candidate;
            }
        }
        return null;
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

import * as path from "path";
import * as fs from "fs-extra";
import chalk from "chalk";
import { spawn, spawnSync } from "child_process";

export interface BuildIslandsHandleOptions {
    /**
     * Rebuild on change instead of a one-shot build. Runs the bundler as a
     * detached background process (doesn't block `nyala dev` from starting
     * the app server) since it never exits on its own in this mode.
     */
    watch?: boolean;
}

/**
 * Bundles app/islands/manifest.ts's components (@nyalajs/react islands) via
 * esbuild, run from `nyala build`/`nyala dev`. A no-op — not even a warning
 * — for apps that don't have that file, so this never affects apps that
 * don't use islands.
 */
export class BuildIslandsCommand {
    async handle(outDir: string, options: BuildIslandsHandleOptions = {}): Promise<void> {
        const manifestPath = path.join(process.cwd(), "app/islands/manifest.ts");

        if (!(await fs.pathExists(manifestPath))) {
            return;
        }

        const runnerPath = path.join(__dirname, "../../runtime/island-builder.ts");
        const env = {
            ...process.env,
            NYALA_ISLANDS_MANIFEST_PATH: manifestPath,
            NYALA_ISLANDS_BASE_DIR: path.join(process.cwd(), "app/islands"),
            NYALA_ISLANDS_OUT_DIR: path.join(process.cwd(), outDir),
            NYALA_ISLANDS_WATCH: options.watch ? "true" : "false",
        };

        if (options.watch) {
            console.log(chalk.cyan("\nWatching islands for changes..."));
            // Non-blocking: this process never exits on its own in watch
            // mode, and `nyala dev` still needs to go on to start nodemon.
            spawn("npx", ["tsx", runnerPath], {
                stdio: "inherit",
                cwd: process.cwd(),
                env,
            });
            return;
        }

        console.log(chalk.cyan("\nBundling islands..."));

        const result = spawnSync("npx", ["tsx", runnerPath], {
            stdio: "inherit",
            cwd: process.cwd(),
            env,
        });

        if (result.status !== 0) {
            console.error(chalk.red("Island bundling failed"));
            process.exit(result.status ?? 1);
        }
    }
}

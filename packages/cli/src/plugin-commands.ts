import * as fs from "fs-extra";
import * as path from "path";
import { Command } from "commander";

const MODULE_NOT_FOUND_CODES = new Set([
    "MODULE_NOT_FOUND",
    "ERR_MODULE_NOT_FOUND",
    "ERR_PACKAGE_PATH_NOT_EXPORTED",
]);

// Bundler/loader-based resolvers (e.g. Vite, used by this project's own test
// runner) don't always preserve Node's error .code for an unexported
// subpath the way plain `node`/`require` do — fall back to matching the
// message so "no ./cli export" is recognized as the expected, silent case
// in either environment.
const NOT_FOUND_MESSAGE_PATTERN = /cannot find module|is not defined by "?exports"?|missing ".*" specifier/i;

function isMissingSubpathError(error: any): boolean {
    return MODULE_NOT_FOUND_CODES.has(error?.code) || NOT_FOUND_MESSAGE_PATTERN.test(error?.message ?? "");
}

/**
 * Lets an installed @nyalajs/* package contribute its own CLI commands
 * without @nyalajs/cli needing a hard dependency on it. A package opts in
 * by exporting a `registerCommands(program: Command)` function from a
 * `./cli` subpath — and listing that subpath in its own package.json
 * "exports" map, since Node's exports resolution is what makes "does this
 * package even have a ./cli entry" a fast, well-defined check rather than
 * a filesystem guess.
 *
 * Example: a future @nyalajs/ai could add `src/cli/index.ts` exporting
 * `registerCommands`, backing `nyala ai ...` — installing @nyalajs/ai in a
 * project would be enough for its commands to show up, with no change to
 * @nyalajs/cli itself.
 *
 * Looks at the *project's* package.json (cwd), not this CLI's own
 * dependencies — a contributing package only needs to be installed by the
 * app, never by @nyalajs/cli.
 */
export async function registerExternalCommands(program: Command, cwd: string = process.cwd()): Promise<void> {
    const projectPackageJsonPath = path.join(cwd, "package.json");
    if (!(await fs.pathExists(projectPackageJsonPath))) return;

    let pkg: any;
    try {
        pkg = await fs.readJson(projectPackageJsonPath);
    } catch {
        return;
    }

    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    const candidates = Object.keys(deps).filter(
        (name) => name.startsWith("@nyalajs/") && name !== "@nyalajs/cli" && name !== "@nyalajs/core"
    );

    for (const name of candidates) {
        try {
            const mod = await import(`${name}/cli`);
            if (typeof mod.registerCommands === "function") {
                mod.registerCommands(program);
            }
        } catch (error: any) {
            // No ./cli export is the overwhelmingly common, expected case
            // (most @nyalajs/* packages don't contribute commands) — only
            // surface genuinely unexpected failures, e.g. a bug inside a
            // package's own registerCommands().
            if (!isMissingSubpathError(error)) {
                console.warn(`[nyala] Failed to load CLI commands from ${name}/cli:`, error);
            }
        }
    }
}

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import * as fs from "fs-extra";
import * as path from "path";
import * as os from "os";
import { Command } from "commander";
import { registerExternalCommands } from "../plugin-commands";

/**
 * Exercises the real dynamic import path, against fixture packages this
 * suite writes into packages/cli/node_modules/@nyalajs/fake-* itself (and
 * removes afterwards) — not mocked, because the whole point of this
 * mechanism is real Node module resolution honoring each package's own
 * "exports" map. The fixtures have to live under an ancestor node_modules
 * of this file for Node to find them via a bare specifier at all; they
 * can't be generated under a tmpdir like the rest of this suite's fixtures,
 * and being under node_modules means git never sees them, so this suite
 * has to (re)create them itself rather than checking them in.
 */
const FIXTURES_ROOT = path.join(__dirname, "../../node_modules/@nyalajs");

async function writeFixturePackage(
    name: string,
    exportsMap: Record<string, string>,
    files: Record<string, string>
) {
    const dir = path.join(FIXTURES_ROOT, name);
    await fs.ensureDir(dir);
    await fs.writeJson(path.join(dir, "package.json"), {
        name: `@nyalajs/${name}`,
        version: "1.0.0",
        main: "index.js",
        exports: exportsMap,
    });
    for (const [file, content] of Object.entries(files)) {
        await fs.writeFile(path.join(dir, file), content);
    }
}

describe("registerExternalCommands", () => {
    beforeAll(async () => {
        await writeFixturePackage(
            "fake-plugin",
            { ".": "./index.js", "./cli": "./cli.js" },
            {
                "index.js": "module.exports = {};",
                "cli.js":
                    'exports.registerCommands = function registerCommands(program) {\n' +
                    '    program.command("fake").description("a fake command contributed by @nyalajs/fake-plugin").action(() => {});\n' +
                    "};",
            }
        );

        await writeFixturePackage("fake-no-cli", { ".": "./index.js" }, { "index.js": "module.exports = {};" });

        await writeFixturePackage(
            "fake-broken",
            { ".": "./index.js", "./cli": "./cli.js" },
            {
                "index.js": "module.exports = {};",
                "cli.js":
                    'exports.registerCommands = function registerCommands() {\n' +
                    '    throw new Error("registerCommands blew up");\n' +
                    "};",
            }
        );
    });

    afterAll(async () => {
        await fs.remove(path.join(FIXTURES_ROOT, "fake-plugin"));
        await fs.remove(path.join(FIXTURES_ROOT, "fake-no-cli"));
        await fs.remove(path.join(FIXTURES_ROOT, "fake-broken"));
    });

    let tmpDir: string;

    beforeEach(async () => {
        tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "nyala-plugin-commands-"));
    });

    afterEach(async () => {
        await fs.remove(tmpDir);
        vi.restoreAllMocks();
    });

    async function writeProjectPackageJson(dependencies: Record<string, string>) {
        await fs.writeJson(path.join(tmpDir, "package.json"), { name: "test-project", dependencies });
    }

    it("registers a command from a package exporting registerCommands from ./cli", async () => {
        await writeProjectPackageJson({ "@nyalajs/fake-plugin": "1.0.0" });

        const program = new Command();
        await registerExternalCommands(program, tmpDir);

        expect(program.commands.some((c) => c.name() === "fake")).toBe(true);
    });

    it("silently skips a package with no ./cli export", async () => {
        await writeProjectPackageJson({ "@nyalajs/fake-no-cli": "1.0.0" });
        const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);

        const program = new Command();
        await expect(registerExternalCommands(program, tmpDir)).resolves.not.toThrow();

        expect(warnSpy).not.toHaveBeenCalled();
    });

    it("warns (but does not throw) when a package's registerCommands itself fails", async () => {
        await writeProjectPackageJson({ "@nyalajs/fake-broken": "1.0.0" });
        const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);

        const program = new Command();
        await expect(registerExternalCommands(program, tmpDir)).resolves.not.toThrow();

        expect(warnSpy).toHaveBeenCalledWith(
            expect.stringContaining("@nyalajs/fake-broken/cli"),
            expect.any(Error)
        );
    });

    it("does nothing when the project has no package.json", async () => {
        const program = new Command();
        await expect(registerExternalCommands(program, tmpDir)).resolves.not.toThrow();
        expect(program.commands).toHaveLength(0);
    });

    it("considers both dependencies and devDependencies", async () => {
        await fs.writeJson(path.join(tmpDir, "package.json"), {
            name: "test-project",
            devDependencies: { "@nyalajs/fake-plugin": "1.0.0" },
        });

        const program = new Command();
        await registerExternalCommands(program, tmpDir);

        expect(program.commands.some((c) => c.name() === "fake")).toBe(true);
    });

    it("ignores non-@nyalajs packages and plain @nyalajs/core or @nyalajs/cli entries", async () => {
        await writeProjectPackageJson({
            "@nyalajs/core": "*",
            "@nyalajs/cli": "*",
            express: "^4.0.0",
        });
        const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);

        const program = new Command();
        await registerExternalCommands(program, tmpDir);

        expect(program.commands).toHaveLength(0);
        expect(warnSpy).not.toHaveBeenCalled();
    });
});

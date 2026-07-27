import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { describe, it, expect, afterEach } from "vitest";
import { buildIslands } from "../islands/build";
import { IslandFileManifest } from "../islands/manifest-cache";

describe("buildIslands()", () => {
    let outDir: string;
    let fixturePath: string | undefined;

    afterEach(() => {
        if (outDir) fs.rmSync(outDir, { recursive: true, force: true });
        if (fixturePath) fs.rmSync(fixturePath, { force: true });
    });

    function readManifest(dir: string): IslandFileManifest {
        return JSON.parse(fs.readFileSync(path.join(dir, "islands-manifest.json"), "utf-8"));
    }

    it("bundles a registered island into a content-hashed, hydratable client entry and writes a matching manifest + bootstrap script", async () => {
        outDir = fs.mkdtempSync(path.join(os.tmpdir(), "nyala-islands-test-"));

        await buildIslands({ Counter: "./fixtures/counter" }, { baseDir: __dirname, outDir });

        const manifest = readManifest(outDir);
        expect(manifest.islands.Counter).toMatch(/^Counter-[a-zA-Z0-9]+\.js$/);
        expect(manifest.bootstrap).toMatch(/^_nyala-islands-[a-zA-Z0-9]+\.js$/);

        const bundlePath = path.join(outDir, "islands", manifest.islands.Counter);
        expect(fs.existsSync(bundlePath)).toBe(true);
        const bundle = fs.readFileSync(bundlePath, "utf-8");
        expect(bundle).toContain("hydrate");
        expect(bundle).toContain("hydrateRoot");

        const bootstrapPath = path.join(outDir, manifest.bootstrap);
        expect(fs.existsSync(bootstrapPath)).toBe(true);
        const bootstrap = fs.readFileSync(bootstrapPath, "utf-8");
        expect(bootstrap).toContain("data-nyala-island");
        expect(bootstrap).toContain(manifest.islands.Counter);
    });

    it("produces a different filename when the component's content changes (cache-busting)", async () => {
        outDir = fs.mkdtempSync(path.join(os.tmpdir(), "nyala-islands-test-"));
        // Written inside __dirname (not the tmpdir) so node_modules
        // resolution (react, react-dom/client) works the same way it
        // would for a real component in the project.
        fixturePath = path.join(__dirname, "fixtures", "counter-varying.tsx");

        fs.writeFileSync(
            fixturePath,
            `import * as React from "react";\nexport default function Counter() { return <button>v1</button>; }\n`
        );
        await buildIslands({ Counter: "./fixtures/counter-varying" }, { baseDir: __dirname, outDir });
        const firstManifest = readManifest(outDir);

        fs.writeFileSync(
            fixturePath,
            `import * as React from "react";\nexport default function Counter() { return <button>v2 - changed</button>; }\n`
        );
        await buildIslands({ Counter: "./fixtures/counter-varying" }, { baseDir: __dirname, outDir });
        const secondManifest = readManifest(outDir);

        expect(firstManifest.islands.Counter).not.toBe(secondManifest.islands.Counter);
        // the old hashed file shouldn't linger after a clean rebuild
        expect(fs.existsSync(path.join(outDir, "islands", firstManifest.islands.Counter))).toBe(false);
    });
});

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { AssetVersionResolver } from "../asset-version";

describe("AssetVersionResolver — dev mode", () => {
    it("getManifest() returns null in dev mode", () => {
        const resolver = new AssetVersionResolver({ outDir: "/nonexistent", dev: true });
        expect(resolver.getManifest()).toBeNull();
    });

    it("getVersion() returns a stable constant in dev mode, regardless of any manifest on disk", () => {
        const resolver = new AssetVersionResolver({ outDir: "/nonexistent", dev: true });
        expect(resolver.getVersion()).toBe("dev");
        expect(resolver.getVersion()).toBe(resolver.getVersion());
    });

    it("respects NYALA_VITE_DEV=true when `dev` option is omitted", () => {
        const original = process.env.NYALA_VITE_DEV;
        process.env.NYALA_VITE_DEV = "true";
        try {
            const resolver = new AssetVersionResolver({ outDir: "/nonexistent" });
            expect(resolver.isDev()).toBe(true);
            expect(resolver.getVersion()).toBe("dev");
        } finally {
            if (original === undefined) delete process.env.NYALA_VITE_DEV;
            else process.env.NYALA_VITE_DEV = original;
        }
    });
});

describe("AssetVersionResolver — production mode", () => {
    let tmpDir: string;

    beforeEach(async () => {
        tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "nyala-inertia-assets-"));
    });

    afterEach(async () => {
        await fs.promises.rm(tmpDir, { recursive: true, force: true });
    });

    async function writeManifest(contents: object) {
        const viteDir = path.join(tmpDir, ".vite");
        await fs.promises.mkdir(viteDir, { recursive: true });
        await fs.promises.writeFile(path.join(viteDir, "manifest.json"), JSON.stringify(contents));
    }

    it("reads the manifest from <outDir>/.vite/manifest.json (Vite 5's real default path)", async () => {
        await writeManifest({
            "app/main.tsx": { file: "assets/main-abc123.js", src: "app/main.tsx", isEntry: true },
        });

        const resolver = new AssetVersionResolver({ outDir: tmpDir, dev: false });
        const manifest = resolver.getManifest();

        expect(manifest).not.toBeNull();
        expect(manifest!["app/main.tsx"].file).toBe("assets/main-abc123.js");
    });

    it("getManifest() returns null when no manifest file exists yet", () => {
        const resolver = new AssetVersionResolver({ outDir: tmpDir, dev: false });
        expect(resolver.getManifest()).toBeNull();
    });

    it("getVersion() falls back to the dev constant when no manifest exists (no build run yet)", () => {
        const resolver = new AssetVersionResolver({ outDir: tmpDir, dev: false });
        expect(resolver.getVersion()).toBe("dev");
    });

    it("getVersion() is a deterministic hash of the manifest contents", async () => {
        await writeManifest({ "app/main.tsx": { file: "assets/main-abc123.js" } });

        const a = new AssetVersionResolver({ outDir: tmpDir, dev: false }).getVersion();
        const b = new AssetVersionResolver({ outDir: tmpDir, dev: false }).getVersion();

        expect(a).toBe(b);
        expect(a).not.toBe("dev");
        expect(a).toMatch(/^[0-9a-f]{40}$/); // sha1 hex digest
    });

    it("getVersion() changes when the manifest contents change (a real rebuild happened)", async () => {
        await writeManifest({ "app/main.tsx": { file: "assets/main-abc123.js" } });
        const before = new AssetVersionResolver({ outDir: tmpDir, dev: false }).getVersion();

        await writeManifest({ "app/main.tsx": { file: "assets/main-xyz789.js" } });
        const after = new AssetVersionResolver({ outDir: tmpDir, dev: false }).getVersion();

        expect(before).not.toBe(after);
    });

    it("caches the manifest/version after the first read (doesn't re-read on every call)", async () => {
        await writeManifest({ "app/main.tsx": { file: "assets/main-abc123.js" } });
        const resolver = new AssetVersionResolver({ outDir: tmpDir, dev: false });

        const firstVersion = resolver.getVersion();
        await writeManifest({ "app/main.tsx": { file: "assets/main-changed.js" } });
        const secondVersion = resolver.getVersion();

        expect(secondVersion).toBe(firstVersion);
    });

    it("resolveEntry() returns the manifest chunk for a known entry", async () => {
        await writeManifest({
            "app/main.tsx": {
                file: "assets/main-abc123.js",
                css: ["assets/main-def456.css"],
                isEntry: true,
            },
        });

        const resolver = new AssetVersionResolver({ outDir: tmpDir, dev: false });
        const chunk = resolver.resolveEntry("app/main.tsx");

        expect(chunk.file).toBe("assets/main-abc123.js");
        expect(chunk.css).toEqual(["assets/main-def456.css"]);
    });

    it("resolveEntry() throws when the manifest doesn't exist", () => {
        const resolver = new AssetVersionResolver({ outDir: tmpDir, dev: false });
        expect(() => resolver.resolveEntry("app/main.tsx")).toThrow(/No Vite manifest found/);
    });

    it("resolveEntry() throws when the manifest exists but lacks the requested entry", async () => {
        await writeManifest({ "app/other.tsx": { file: "assets/other-abc123.js" } });

        const resolver = new AssetVersionResolver({ outDir: tmpDir, dev: false });
        expect(() => resolver.resolveEntry("app/main.tsx")).toThrow(/no entry for "app\/main\.tsx"/);
    });
});

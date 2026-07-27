import * as path from "path";
import * as fs from "fs";
import { defineIsland } from "./registry";
import { IslandManifest } from "./manifest";
import { IslandFileManifest, setIslandFileManifest } from "./manifest-cache";

/**
 * Loads every component in `manifest` and registers it, so `island(name,
 * props)` can render it, and loads the build-time file manifest (produced
 * by `buildIslands()`) so `ViewResponse.render()` knows the current
 * content-hashed bundle/bootstrap filenames. Call this once at app startup,
 * before `app.listen()` — same lifecycle spot as `Model.setDatabase()`.
 *
 * `staticDir` should be the same directory passed as `FastifyAdapterOptions.staticDir`.
 * If `islands-manifest.json` isn't there yet (no build has run), islands
 * still register for rendering, but using one in a view will throw a clear
 * error telling you to run `nyala build`/`nyala dev` first — not a silent
 * 404 script tag.
 */
export async function registerIslands(manifest: IslandManifest, baseDir: string, staticDir: string): Promise<void> {
    for (const [name, relativePath] of Object.entries(manifest)) {
        const mod = await import(path.resolve(baseDir, relativePath));
        const component = mod.default ?? mod[name];

        if (!component) {
            throw new Error(
                `Island "${name}" (${relativePath}) has no default export and no export named "${name}".`
            );
        }

        defineIsland(name, component);
    }

    const manifestPath = path.join(staticDir, "islands-manifest.json");
    if (fs.existsSync(manifestPath)) {
        const fileManifest: IslandFileManifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
        setIslandFileManifest(fileManifest);
    }
}

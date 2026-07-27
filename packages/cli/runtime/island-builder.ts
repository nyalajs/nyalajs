/**
 * Executed via `npx tsx` from the target project's directory (not compiled
 * by the CLI's own tsc build) so it can load the project's
 * app/islands/manifest.ts (TypeScript, plain relative-path strings) and
 * component files directly, using the project's own tsconfig/node_modules —
 * same reasoning as runtime/migration-runner.ts.
 *
 * Reads its instructions from env vars set by BuildIslandsCommand:
 *   NYALA_ISLANDS_MANIFEST_PATH   absolute path to app/islands/manifest.ts
 *   NYALA_ISLANDS_BASE_DIR        absolute path to app/islands (manifest paths resolve against this)
 *   NYALA_ISLANDS_OUT_DIR         absolute path to write public/islands/ + manifest/bootstrap into
 *   NYALA_ISLANDS_WATCH           "true" from `nyala dev` — rebuild on change instead of a one-shot build;
 *                                 this process stays alive (esbuild's watchers hold the event loop open)
 */

async function main(): Promise<void> {
    const manifestPath = process.env.NYALA_ISLANDS_MANIFEST_PATH;
    const baseDir = process.env.NYALA_ISLANDS_BASE_DIR;
    const outDir = process.env.NYALA_ISLANDS_OUT_DIR;
    const watch = process.env.NYALA_ISLANDS_WATCH === "true";

    if (!manifestPath || !baseDir || !outDir) {
        throw new Error(
            "island-builder requires NYALA_ISLANDS_MANIFEST_PATH, NYALA_ISLANDS_BASE_DIR, and NYALA_ISLANDS_OUT_DIR"
        );
    }

    const manifestMod: any = await import(manifestPath);
    const manifest = manifestMod.islands ?? manifestMod.default;

    if (!manifest || Object.keys(manifest).length === 0) {
        console.log("app/islands/manifest.ts has no islands registered — nothing to bundle.");
        return;
    }

    let buildIslands: any;
    try {
        ({ buildIslands } = await import("@nyalajs/react/build"));
    } catch {
        console.warn(
            "app/islands/manifest.ts exists but @nyalajs/react isn't installed in this project — skipping island build."
        );
        return;
    }

    await buildIslands(manifest, { baseDir, outDir, watch });

    if (watch) {
        console.log(`Watching ${Object.keys(manifest).length} island(s) for changes -> ${outDir}/islands/`);
        // Deliberately no process.exit() — esbuild's active watchers keep
        // the event loop (and this process) alive until it's killed.
    } else {
        console.log(`Islands bundled -> ${outDir}/islands/ (${Object.keys(manifest).length} island(s))`);
    }
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});

import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";

/**
 * A parsed Vite build manifest — keyed by source file path (e.g.
 * "resources/js/app.tsx"), verified against the real output of `vite build` with
 * `build.manifest: true` (Vite 5.4.21). Only the fields this package
 * actually reads are declared; Vite's manifest has more.
 */
export interface ViteManifestChunk {
    file: string;
    name?: string;
    src?: string;
    isEntry?: boolean;
    css?: string[];
    assets?: string[];
    imports?: string[];
}

export type ViteManifest = Record<string, ViteManifestChunk>;

export interface AssetResolverOptions {
    /**
     * Absolute path to the Vite build output directory (e.g.
     * path.join(process.cwd(), "public/build")). The manifest is read from
     * "<outDir>/.vite/manifest.json" — Vite 5's real default location,
     * confirmed by running `vite build` with `build.manifest: true` (older
     * Vite versions/docs reference a bare "manifest.json" at the output
     * root, which is NOT where Vite 5 actually writes it).
     */
    outDir: string;
    /**
     * True (or NYALA_VITE_DEV=true) while the Vite dev server owns asset
     * serving. Dev mode never reads the manifest and returns a constant
     * version — Inertia's 409-reload-on-stale-version protocol only makes
     * sense once real hashed production builds exist.
     */
    dev?: boolean;
}

const DEV_VERSION = "dev";

/**
 * Resolves the Inertia "asset version" string used for the
 * X-Inertia-Version / 409 stale-reload protocol. In dev mode this is a
 * stable constant (assets are served live from Vite's dev server, never
 * stale). In production it's a hash of the Vite manifest's contents, so
 * any rebuild — even one that changes hashed filenames but not this
 * resolver's code — naturally changes the version and forces connected
 * clients to hard-reload once.
 */
export class AssetVersionResolver {
    private cachedManifest: ViteManifest | null | undefined;
    private cachedVersion: string | undefined;

    constructor(private readonly options: AssetResolverOptions) {}

    isDev(): boolean {
        return this.options.dev ?? process.env.NYALA_VITE_DEV === "true";
    }

    private manifestPath(): string {
        return path.join(this.options.outDir, ".vite", "manifest.json");
    }

    /**
     * Reads and parses the manifest, caching the result for the process
     * lifetime — production processes don't rebuild while running, so
     * re-reading the file on every request would be pure overhead. Returns
     * null if no manifest exists yet (e.g. `vite build` hasn't run).
     */
    getManifest(): ViteManifest | null {
        if (this.isDev()) return null;

        if (this.cachedManifest !== undefined) {
            return this.cachedManifest;
        }

        try {
            const raw = fs.readFileSync(this.manifestPath(), "utf-8");
            this.cachedManifest = JSON.parse(raw) as ViteManifest;
        } catch {
            this.cachedManifest = null;
        }

        return this.cachedManifest;
    }

    /**
     * The version string sent as X-Inertia-Version / InertiaPage.version.
     * A sha1 hash of the raw manifest contents — cheap, stable across
     * requests, and changes iff the manifest's contents change (i.e. a
     * real rebuild happened).
     */
    getVersion(): string {
        if (this.isDev()) return DEV_VERSION;

        if (this.cachedVersion !== undefined) {
            return this.cachedVersion;
        }

        let raw: string;
        try {
            raw = fs.readFileSync(this.manifestPath(), "utf-8");
        } catch {
            // No manifest yet (build hasn't run). Use a constant so the
            // app doesn't loop on spurious 409s before the first build —
            // matches dev's "no stale-version protocol" behavior.
            this.cachedVersion = DEV_VERSION;
            return this.cachedVersion;
        }

        this.cachedVersion = crypto.createHash("sha1").update(raw).digest("hex");
        return this.cachedVersion;
    }

    /**
     * Resolves an entry's built, hashed file path (relative to outDir) for
     * use in a production <script>/<link> tag. Throws if the manifest or
     * the entry is missing — a production app serving broken asset paths
     * should fail loudly, not silently render a blank page.
     */
    resolveEntry(entrySrc: string): ViteManifestChunk {
        const manifest = this.getManifest();
        if (!manifest) {
            throw new Error(
                `[@nyalajs/inertia] No Vite manifest found at ${this.manifestPath()}. ` +
                `Run \`nyala build\` (or \`vite build\`) before starting in production mode.`
            );
        }

        const chunk = manifest[entrySrc];
        if (!chunk) {
            throw new Error(
                `[@nyalajs/inertia] Vite manifest has no entry for "${entrySrc}". ` +
                `Available entries: ${Object.keys(manifest).join(", ") || "(none)"}`
            );
        }

        return chunk;
    }
}

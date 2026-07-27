/**
 * The build-time-generated manifest (islands-manifest.json), loaded once at
 * app startup by registerIslands() and read by ViewResponse.render() to
 * know the current content-hashed bundle/bootstrap filenames. Process-
 * lifetime state, not per-request — a plain module-level variable, unlike
 * IslandTrackingContext (which is per-render).
 */
export interface IslandFileManifest {
    islands: Record<string, string>;
    bootstrap: string;
}

let manifest: IslandFileManifest | null = null;

export function setIslandFileManifest(value: IslandFileManifest | null): void {
    manifest = value;
}

export function getIslandFileManifest(): IslandFileManifest | null {
    return manifest;
}

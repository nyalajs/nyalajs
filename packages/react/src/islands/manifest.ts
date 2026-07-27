/**
 * Island name -> path to the module exporting the component (default
 * export, or a named export matching the island name), relative to
 * `baseDir` passed to registerIslands()/buildIslands(). One manifest feeds
 * both the runtime registration and the esbuild bundling step, so there's
 * a single source of truth for "what islands exist."
 */
export type IslandManifest = Record<string, string>;

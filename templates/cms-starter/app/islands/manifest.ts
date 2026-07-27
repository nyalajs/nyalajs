import { IslandManifest } from "@nyalajs/react";

/**
 * Island name -> path to its component module (relative to this file).
 * Read by both registerIslands() (bootstrap/main.ts, at app startup) and
 * buildIslands() (via `nyala build`/`nyala dev`) — one source of truth.
 * See docs/islands.md.
 */
export const islands: IslandManifest = {
    MenuReorder: "./menu-reorder",
    MediaUploader: "./media-uploader",
};

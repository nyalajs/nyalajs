import * as path from "path";

/**
 * Points at the monorepo's real docs source — the same website/docs/*.md
 * files the VitePress site (website/docs/.vitepress) builds from and that
 * were just brought up to date to cover the inertia-starter template. This
 * app reads and renders them directly at request time (see
 * app/services/docs.service.ts), so there is no separate copy of the
 * content to keep in sync.
 *
 * Resolved against process.cwd(), not __dirname: __dirname's depth
 * relative to the repo root differs between dev (config/docs.ts, two
 * levels under examples/docs-site/) and prod (dist/config/docs.js, one
 * level deeper again because of dist/ itself) — verified this actually
 * resolves to the wrong directory in prod if computed via __dirname (see
 * templates/inertia-starter/bootstrap/main.ts's identical reasoning for
 * its own asset-path resolution). `npm run dev`/`npm start` both always
 * launch from this project's root (examples/docs-site/), so cwd is the
 * one path that's consistently correct either way.
 *
 * DOCS_SOURCE_DIR overrides this entirely if this app is deployed from a
 * checkout layout where website/docs/ isn't two levels up (see
 * README.md's deployment section).
 */
export default {
    sourceDir: process.env.DOCS_SOURCE_DIR || path.resolve(process.cwd(), "../../website/docs"),
};

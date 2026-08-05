# @nyalajs/inertia

## 1.1.0

### Minor Changes

- Introduce `@nyalajs/inertia`: a real Inertia.js server adapter for NyalaJS. Controllers return page components with props — no separate REST/GraphQL API, no client-side router — the same model as Laravel+Inertia or Rails+Inertia.

  - Full protocol implementation on top of the existing `RenderableResponse` seam: `X-Inertia` JSON/HTML branching, `X-Inertia-Version` mismatch handling (409 + `X-Inertia-Location`), partial reloads (`X-Inertia-Partial-Component`/`Data`/`Except`), request-scoped shared props, and read-once flash messages.
  - Depends on the real `@inertiajs/react`/`@inertiajs/core` packages rather than reimplementing the client protocol.
  - SSR support (`@inertiajs/react/server`) is included but off by default, matching how Laravel's own Inertia starter kits ship it.
  - A dev/production asset-version resolver reads Vite's build manifest, so the 409 stale-asset protocol works against real builds.

  `nyala dev`/`nyala build` gained real Vite integration (a genuine Vite dev server child process in dev, a genuine `vite build` producing `manifest.json` in production) — a no-op for every existing template, following the same pattern already used for esbuild-based islands.

  New starter: `nyala new my-app --template=inertia` scaffolds `templates/inertia-starter` — session auth, a full Posts CRUD resource demonstrating shared props/flash/validation-errors round-tripping to the client, SQLite by default for zero-external-dependency setup, migrations, seeders, and tests.

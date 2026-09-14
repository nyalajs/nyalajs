import { defineWorkspace } from "vitest/config";

// Enumerates every workspace that has its own tests, so a single root
// `vitest run --coverage` invocation exercises them all in one process
// and produces one real, merged coverage report — instead of the 25+
// disconnected per-package `coverage/` directories that running each
// package's own `vitest run` separately (e.g. via `turbo run test`)
// would produce, none of which is what CI's codecov upload step
// (expecting a single ./coverage/coverage-final.json) can consume.
//
// Each entry points at a workspace's own vitest.config.ts (or the
// package directory itself, for the common case with no config
// overrides) so package-specific settings — e.g. @nyalajs/cli's
// exclude of its bundled runtime/templates/** — are still honored.
export default defineWorkspace([
    "packages/*",
    "templates/inertia-starter",
    "templates/saas-starter",
    "examples/docs-site",
    "examples/helpdesk-saas",
    "examples/todo-api",
]);

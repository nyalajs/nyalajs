import { defineConfig } from "vitest/config";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

// graphql-js ships both a CJS build (index.js, "main") and an ESM build
// (index.mjs, "module"/legacy — no "exports" map to unify them). This
// package's own source, transpiled by Vitest's esbuild pipeline, ends up
// requiring the CJS build; graphql-yoga's package.json "exports" sends ITS
// internal `import "graphql"` down the ESM build instead. Two different
// files loaded as two separate module instances — even in the same
// process — so graphql-js's own runtime identity checks (assertSchema,
// instanceOf) reject a schema built by one copy when graphql-yoga's
// executor (built against the other copy) tries to use it, reporting it as
// "from another module or realm" even though it's the exact object just
// constructed. `resolve.dedupe` alone doesn't reach this because the two
// entry points aren't going through the same resolution algorithm (one via
// require(), one via package.json "exports" conditions) for dedupe to
// unify. An explicit alias to graphql's own CJS entry point — resolved once,
// here, via Node's own require.resolve — forces every resolution of
// "graphql" through that one physical file, which is what actually fixes it.
export default defineConfig({
    resolve: {
        alias: {
            graphql: require.resolve("graphql"),
        },
    },
});

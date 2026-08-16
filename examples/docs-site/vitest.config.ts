import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        environment: "node",
        include: ["tests/**/*.spec.ts"],
        // database/connection.ts reads process.env.DB_PATH in a top-level
        // `new Database(dbPath)` call, executed as soon as anything imports
        // it — under ESM semantics all `import`s in a module are hoisted
        // above the rest of that module's body, so a spec file's own
        // top-level `process.env.DB_PATH = ...` (written textually before
        // its imports) actually runs AFTER those imports load
        // database/connection.ts, not before (verified: it was silently
        // losing to the default, pointing "isolated" tests at this app's
        // real storage/database.sqlite). `test.env` is Vitest's own
        // mechanism for env vars guaranteed to apply before any test
        // module's code runs at all. Every DB-touching spec file resets its
        // own table in beforeAll rather than assuming a fresh file, and
        // fileParallelism is off so they don't race each other over this
        // one shared path.
        env: {
            DB_PATH: "./storage/test.sqlite",
        },
        fileParallelism: false,
        coverage: {
            provider: "v8",
            reporter: ["text", "json", "html"],
            exclude: ["node_modules/", "dist/", "**/*.spec.ts", "**/tests/**"],
        },
    },
});

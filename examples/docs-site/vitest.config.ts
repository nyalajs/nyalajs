import * as dotenv from "dotenv";
import { defineConfig } from "vitest/config";

// Vite's own automatic .env loading isn't visible yet when this config
// file's top-level code runs (verified: process.env.DB_PASSWORD was still
// empty inside test.env's callback even with a real .env present) —
// loading it explicitly here is the reliable way to pull DB_PASSWORD in
// without hardcoding a real credential into this committed file.
dotenv.config();

export default defineConfig({
    test: {
        environment: "node",
        include: ["tests/**/*.spec.ts"],
        // database/connection.ts reads process.env.DB_* in a top-level
        // mysql.createPool(...) call, executed as soon as anything imports
        // it — under ESM semantics all `import`s in a module are hoisted
        // above the rest of that module's body, so a spec file's own
        // top-level `process.env.DB_NAME = ...` (written textually before
        // its imports) actually runs AFTER those imports load
        // database/connection.ts, not before. `test.env` is Vitest's own
        // mechanism for env vars guaranteed to apply before any test
        // module's code runs at all — pointed at a real, separate
        // nyaladocs_test database (not this app's real nyaladocs one) so a
        // test run can never touch real seeded content. Every DB-touching
        // spec file resets its own table in beforeAll rather than assuming
        // a clean database, and fileParallelism is off so they don't race
        // each other over this one shared database.
        env: {
            DB_HOST: process.env.DB_HOST || "127.0.0.1",
            DB_PORT: process.env.DB_PORT || "3306",
            DB_USER: process.env.DB_USER || "root",
            DB_PASSWORD: process.env.DB_PASSWORD || "",
            DB_NAME: "nyaladocs_test",
            DATABASE_URL: "",
        },
        fileParallelism: false,
        coverage: {
            provider: "v8",
            reporter: ["text", "json", "html"],
            exclude: ["node_modules/", "dist/", "**/*.spec.ts", "**/tests/**"],
        },
    },
});

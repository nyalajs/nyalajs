import { defineConfig } from "vitest/config";

// Coverage settings shared by every project in vitest.workspace.ts when
// run via the root `test:coverage` script (`vitest run --coverage`).
// `json` matches what CI's codecov-action step reads
// (./coverage/coverage-final.json); `text`/`html` are for local runs.
export default defineConfig({
    test: {
        coverage: {
            provider: "v8",
            reporter: ["text", "html", "json"],
            reportsDirectory: "./coverage",
            // Thresholds are scoped to the framework packages themselves
            // (currently ~78-82% each) rather than the merged workspace
            // total (~9-64%, depending on metric) — that total is
            // dominated by templates/* and examples/*, which are
            // generated application scaffolding for end users, not
            // hand-maintained library code, and were never meant to carry
            // the same per-line coverage bar as the packages that ship on
            // npm. `include` narrows what these thresholds measure
            // without narrowing what `vitest.workspace.ts` runs — the
            // template/example test suites still execute and still land
            // in the merged report, they just aren't held to this gate.
            include: ["packages/**/src/**"],
            thresholds: {
                lines: 70,
                branches: 70,
                functions: 70,
                statements: 70,
            },
        },
    },
});

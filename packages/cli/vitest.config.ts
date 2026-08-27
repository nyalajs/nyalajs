import { defineConfig } from "vitest/config";
import { configDefaults } from "vitest/config";

export default defineConfig({
    test: {
        // `runtime/templates/` is a build-time COPY of each starter
        // template's git-tracked files (see scripts/copy-templates.js),
        // bundled here purely so the published @nyalajs/cli package
        // includes them — see new.command.spec.ts for why. Those
        // templates carry their own *.spec.ts files (their own real app
        // logic, not this package's) which Vitest's default include glob
        // would otherwise pick up and run as part of THIS package's test
        // suite by accident, once `npm run build`'s prebuild step has
        // populated the directory. Excluded explicitly — the templates'
        // own tests are exercised by whichever project actually uses that
        // template, not by @nyalajs/cli's own test run.
        exclude: [...configDefaults.exclude, "runtime/templates/**"],
    },
});

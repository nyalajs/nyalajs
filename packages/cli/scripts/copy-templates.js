#!/usr/bin/env node
/**
 * Copies each starter template's git-tracked files into
 * packages/cli/runtime/templates/<name>/ so they ship INSIDE the published
 * @nyalajs/cli npm package.
 *
 * Why this exists: `nyala new --template=X` previously resolved template
 * paths via `path.join(__dirname, "../../../../templates", folder)` —
 * correct only when running from inside this monorepo's own checkout
 * (packages/cli/dist/commands/ -> up 4 -> repo root -> templates/). The
 * published npm package's `files` field never included the top-level
 * templates/ directory at all, so for every real user who installed
 * @nyalajs/cli from npm, `nyala new --template=mvc/saas/cms/inertia`
 * silently fell back to the bare/empty scaffold — every single time,
 * with zero warning. Confirmed by inspecting the real published tarball
 * (`npm pack @nyalajs/cli@2.2.0 --dry-run`): zero template-related files.
 *
 * Uses `git ls-files` (not a raw recursive copy) to pick up exactly the
 * files actually meant to ship — each template folder also has a real
 * `node_modules/`/`dist/` sitting on disk from local dev runs, which are
 * correctly gitignored and must never end up in the published package.
 *
 * Run via `npm run build` (prebuild step) — see package.json.
 */
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const REPO_ROOT = path.resolve(__dirname, "../../..");
const TEMPLATES_SRC = path.join(REPO_ROOT, "templates");
const TEMPLATES_DEST = path.join(__dirname, "..", "runtime", "templates");

const TEMPLATE_FOLDERS = ["basic-starter", "saas-starter", "cms-starter", "inertia-starter"];

function copyTrackedFiles(templateName) {
    const srcDir = path.join(TEMPLATES_SRC, templateName);
    const destDir = path.join(TEMPLATES_DEST, templateName);

    if (!fs.existsSync(srcDir)) {
        throw new Error(`copy-templates: source template directory missing: ${srcDir}`);
    }

    // `git ls-files` run WITH cwd=srcDir returns paths relative to srcDir
    // directly — exactly the tracked files, correctly excluding the real
    // node_modules/dist/.turbo directories that sit alongside them on disk.
    const output = execFileSync("git", ["ls-files"], { cwd: srcDir, encoding: "utf8" });
    const files = output.split("\n").filter(Boolean);

    if (files.length === 0) {
        throw new Error(`copy-templates: "git ls-files" returned zero tracked files for ${srcDir} — is this actually a git checkout?`);
    }

    fs.rmSync(destDir, { recursive: true, force: true });

    for (const relativeFile of files) {
        const src = path.join(srcDir, relativeFile);
        const dest = path.join(destDir, relativeFile);
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.copyFileSync(src, dest);
    }

    console.log(`  copied ${files.length} files: ${templateName}`);
}

console.log("Bundling starter templates into packages/cli/runtime/templates/ ...");
for (const template of TEMPLATE_FOLDERS) {
    copyTrackedFiles(template);
}
console.log("Done.");

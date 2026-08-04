import ignore, { Ignore } from "ignore";
import * as fs from "fs-extra";
import * as path from "path";

const SECRET_FILENAME_PATTERNS: RegExp[] = [
    /^\.env(\..+)?$/,
    /\.pem$/i,
    /\.key$/i,
    /^id_rsa$/,
    /^id_ed25519$/,
    /\.p12$/i,
    /\.pfx$/i,
    /credentials\.json$/i,
];

/**
 * Decides which files never get read at all, and scrubs secret-shaped
 * substrings from content that does get sent — the hard security
 * boundary between "a project's source" and "what an LLM provider sees".
 * Every AI feature that reads project files (explain/review/resolve) must
 * go through this before assembling a prompt; nothing that reads project
 * content is exempt.
 *
 * Path exclusion uses the real `ignore` package (the same gitignore-glob
 * parser ESLint/Prettier use) rather than hand-rolled glob matching —
 * gitignore syntax (negation, `**`, directory-only patterns, anchoring)
 * has enough edge cases that a hand-rolled matcher would be a false sense
 * of security.
 */
export class SecretRedactor {
    private readonly ig: Ignore = ignore();
    private gitignoreLoaded = false;

    constructor(private readonly projectRoot: string) {}

    private async ensureGitignoreLoaded(): Promise<void> {
        if (this.gitignoreLoaded) return;
        this.gitignoreLoaded = true;

        const gitignorePath = path.join(this.projectRoot, ".gitignore");
        if (await fs.pathExists(gitignorePath)) {
            this.ig.add(await fs.readFile(gitignorePath, "utf-8"));
        }
        // Excluded even for projects with no .gitignore or one that doesn't list these.
        this.ig.add([".git", "node_modules"]);
    }

    /** True if this path must never be read at all — check before reading file content. */
    async isExcludedPath(relativePath: string): Promise<boolean> {
        await this.ensureGitignoreLoaded();

        const normalized = relativePath.split(path.sep).join("/").replace(/^\.\//, "");
        if (this.ig.ignores(normalized)) return true;

        return SECRET_FILENAME_PATTERNS.some((pattern) => pattern.test(path.basename(relativePath)));
    }

    /**
     * Scrubs secret-shaped substrings from content that IS being sent — a
     * second layer, in case a secret leaked into a file that isn't itself
     * excluded (e.g. a hardcoded key committed into application source).
     */
    redactContent(content: string): string {
        let result = content;

        result = result.replace(
            /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
            "[REDACTED:private-key]"
        );
        result = result.replace(/\bAKIA[0-9A-Z]{16}\b/g, "[REDACTED:aws-access-key]");
        result = result.replace(/\bsk-ant-[A-Za-z0-9_-]{20,}\b/g, "[REDACTED:api-key]");
        result = result.replace(/\bsk-[A-Za-z0-9]{20,}\b/g, "[REDACTED:api-key]");
        result = result.replace(
            /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
            "[REDACTED:jwt]"
        );
        // Negative lookahead skips values the earlier passes above already
        // redacted — without it, `apiKey = "[REDACTED:api-key]"` matches
        // this pattern too (it's still an 8+ char quoted value) and gets
        // redacted a second time, destroying the more specific label.
        result = result.replace(
            /(api[_-]?key|secret|password|passwd|token)(\s*[:=]\s*['"])(?!\[REDACTED)([^'"]{8,})(['"])/gi,
            (_match, keyName, separator, _value, quote) => `${keyName}${separator}[REDACTED]${quote}`
        );

        return result;
    }

    /** Convenience: reads a file's content already redacted, or null if the path is excluded entirely. */
    async readRedacted(relativePath: string): Promise<string | null> {
        if (await this.isExcludedPath(relativePath)) return null;
        const fullPath = path.join(this.projectRoot, relativePath);
        const content = await fs.readFile(fullPath, "utf-8");
        return this.redactContent(content);
    }
}

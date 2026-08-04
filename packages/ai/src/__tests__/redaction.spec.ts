import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs-extra";
import * as path from "path";
import * as os from "os";
import { SecretRedactor } from "../security/redaction";

describe("SecretRedactor — path exclusion", () => {
    let root: string;

    beforeEach(async () => {
        root = await fs.mkdtemp(path.join(os.tmpdir(), "nyala-redaction-"));
    });

    afterEach(async () => {
        await fs.remove(root);
    });

    it.each([".env", ".env.production", ".env.local", "id_rsa", "id_ed25519", "server.pem", "cert.key", "credentials.json"])(
        "excludes %s by filename pattern",
        async (filename) => {
            const redactor = new SecretRedactor(root);
            expect(await redactor.isExcludedPath(filename)).toBe(true);
        }
    );

    it.each(["app.ts", "package.json", "README.md", "user.controller.ts"])(
        "does not exclude an ordinary source file: %s",
        async (filename) => {
            const redactor = new SecretRedactor(root);
            expect(await redactor.isExcludedPath(filename)).toBe(false);
        }
    );

    it("always excludes node_modules and .git even with no .gitignore file", async () => {
        const redactor = new SecretRedactor(root);
        expect(await redactor.isExcludedPath("node_modules/some-pkg/index.js")).toBe(true);
        expect(await redactor.isExcludedPath(".git/config")).toBe(true);
    });

    it("respects real .gitignore patterns, including directory globs", async () => {
        await fs.writeFile(path.join(root, ".gitignore"), "*.log\ndist/\ncoverage\n");
        const redactor = new SecretRedactor(root);

        expect(await redactor.isExcludedPath("server.log")).toBe(true);
        expect(await redactor.isExcludedPath("dist/index.js")).toBe(true);
        expect(await redactor.isExcludedPath("coverage/report.html")).toBe(true);
        expect(await redactor.isExcludedPath("app/controllers/user.controller.ts")).toBe(false);
    });

    it("respects gitignore negation patterns", async () => {
        await fs.writeFile(path.join(root, ".gitignore"), "*.log\n!important.log\n");
        const redactor = new SecretRedactor(root);

        expect(await redactor.isExcludedPath("debug.log")).toBe(true);
        expect(await redactor.isExcludedPath("important.log")).toBe(false);
    });

    it("caches the parsed .gitignore across multiple calls", async () => {
        await fs.writeFile(path.join(root, ".gitignore"), "*.log\n");
        const redactor = new SecretRedactor(root);

        await redactor.isExcludedPath("a.log");
        // Change the file on disk after the first call — should NOT be picked up (the whole
        // point of caching is one read per redactor instance, so this behavior is intentional).
        await fs.writeFile(path.join(root, ".gitignore"), "*.txt\n");
        expect(await redactor.isExcludedPath("b.log")).toBe(true);
    });
});

describe("SecretRedactor — content redaction", () => {
    const redactor = new SecretRedactor("/irrelevant");

    it("redacts a PEM private key block", () => {
        const key = "-----BEGIN RSA PRIVATE KEY-----\nMIIBOgIBAAJBAK...\n-----END RSA PRIVATE KEY-----";
        const result = redactor.redactContent(`const key = \`${key}\`;`);
        expect(result).toContain("[REDACTED:private-key]");
        expect(result).not.toContain("MIIBOgIBAAJBAK");
    });

    it("redacts an AWS access key", () => {
        const result = redactor.redactContent("AWS_KEY=AKIAIOSFODNN7EXAMPLE");
        expect(result).toBe("AWS_KEY=[REDACTED:aws-access-key]");
    });

    it("redacts an Anthropic-style API key", () => {
        const result = redactor.redactContent("ANTHROPIC_API_KEY=sk-ant-api03-abcdefghijklmnopqrstuvwxyz1234567890");
        expect(result).toContain("[REDACTED:api-key]");
        expect(result).not.toContain("abcdefghijklmnop");
    });

    it("redacts an OpenAI-style API key", () => {
        const result = redactor.redactContent("OPENAI_API_KEY=sk-abcdefghijklmnopqrstuvwxyz123456");
        expect(result).toContain("[REDACTED:api-key]");
    });

    it("redacts a JWT", () => {
        const jwt =
            "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U";
        const result = redactor.redactContent(`Authorization: Bearer ${jwt}`);
        expect(result).toBe("Authorization: Bearer [REDACTED:jwt]");
    });

    it("redacts a generic key/secret/password/token assignment, preserving the key name", () => {
        const result = redactor.redactContent('const password = "hunter2ButLonger123";');
        expect(result).toBe('const password = "[REDACTED]";');
    });

    it("does not touch ordinary, non-secret-shaped code", () => {
        const code = "export class UsersController {\n  async index() { return this.users.findAll(); }\n}";
        expect(redactor.redactContent(code)).toBe(code);
    });

    it("does not false-positive on a short, clearly-non-secret password field", () => {
        // Under 8 chars — the generic pattern requires 8+ to avoid flagging e.g. `type: "text"`.
        const code = 'const type = "text";';
        expect(redactor.redactContent(code)).toBe(code);
    });
});

describe("SecretRedactor — readRedacted()", () => {
    let root: string;

    beforeEach(async () => {
        root = await fs.mkdtemp(path.join(os.tmpdir(), "nyala-redaction-read-"));
    });

    afterEach(async () => {
        await fs.remove(root);
    });

    it("returns null for an excluded path without reading it", async () => {
        await fs.writeFile(path.join(root, ".env"), "DB_PASSWORD=supersecret123");
        const redactor = new SecretRedactor(root);

        expect(await redactor.readRedacted(".env")).toBeNull();
    });

    it("returns redacted content for an included file", async () => {
        await fs.writeFile(path.join(root, "config.ts"), 'export const apiKey = "sk-abcdefghijklmnopqrstuvwxyz123456";');
        const redactor = new SecretRedactor(root);

        const content = await redactor.readRedacted("config.ts");
        expect(content).toContain("[REDACTED:api-key]");
    });
});

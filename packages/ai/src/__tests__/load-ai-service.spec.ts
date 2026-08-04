import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs-extra";
import * as path from "path";
import * as os from "os";
import { loadAiServiceFromEnv } from "../cli/load-ai-service";

const ENV_VARS = [
    "AI_PROVIDER",
    "AI_MODEL",
    "AI_BASE_URL",
    "ANTHROPIC_API_KEY",
    "ANTHROPIC_AUTH_TOKEN",
    "OPENAI_API_KEY",
    "GEMINI_API_KEY",
    "GROQ_API_KEY",
    "DEEPSEEK_API_KEY",
    "OPENROUTER_API_KEY",
];

describe("loadAiServiceFromEnv", () => {
    let tmpDir: string;
    const originalEnv: Record<string, string | undefined> = {};

    beforeEach(async () => {
        tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "nyala-ai-config-"));
        for (const key of ENV_VARS) {
            originalEnv[key] = process.env[key];
            delete process.env[key];
        }
    });

    afterEach(async () => {
        await fs.remove(tmpDir);
        for (const key of ENV_VARS) {
            if (originalEnv[key] === undefined) delete process.env[key];
            else process.env[key] = originalEnv[key];
        }
    });

    it("defaults to the anthropic driver", () => {
        process.env.ANTHROPIC_API_KEY = "key";
        const service = loadAiServiceFromEnv(tmpDir);
        expect(service.provider().name).toBe("default");
    });

    it("throws a clear error naming both accepted env vars when neither is set", () => {
        process.env.AI_PROVIDER = "anthropic";
        expect(() => loadAiServiceFromEnv(tmpDir)).toThrow(/ANTHROPIC_API_KEY.*ANTHROPIC_AUTH_TOKEN/);
    });

    it("ANTHROPIC_AUTH_TOKEN alone (no ANTHROPIC_API_KEY) is enough to connect", () => {
        process.env.AI_PROVIDER = "anthropic";
        process.env.ANTHROPIC_AUTH_TOKEN = "oauth-token-value";
        expect(() => loadAiServiceFromEnv(tmpDir)).not.toThrow();
    });

    it("throws a clear error for an unknown AI_PROVIDER", () => {
        process.env.AI_PROVIDER = "not-a-real-provider";
        expect(() => loadAiServiceFromEnv(tmpDir)).toThrow(/Unknown AI_PROVIDER/);
    });

    it("does not require an API key for ollama", () => {
        process.env.AI_PROVIDER = "ollama";
        expect(() => loadAiServiceFromEnv(tmpDir)).not.toThrow();
    });

    it("applies a driver-specific default model when AI_MODEL isn't set", () => {
        process.env.AI_PROVIDER = "groq";
        process.env.GROQ_API_KEY = "key";
        // No throw means the built-in defaultModel for groq satisfied AiService's requirement.
        expect(() => loadAiServiceFromEnv(tmpDir)).not.toThrow();
    });

    it("AI_MODEL overrides the driver's built-in default", () => {
        process.env.AI_PROVIDER = "anthropic";
        process.env.ANTHROPIC_API_KEY = "key";
        process.env.AI_MODEL = "claude-haiku-4-5";
        expect(() => loadAiServiceFromEnv(tmpDir)).not.toThrow();
    });

    it("loads values from a .env file in the given cwd", async () => {
        await fs.writeFile(path.join(tmpDir, ".env"), "AI_PROVIDER=gemini\nGEMINI_API_KEY=from-dotenv\n");
        expect(() => loadAiServiceFromEnv(tmpDir)).not.toThrow();
    });

    it("AI_BASE_URL is forwarded for self-hosted/proxy endpoints", () => {
        process.env.AI_PROVIDER = "ollama";
        process.env.AI_BASE_URL = "http://localhost:9999/v1";
        expect(() => loadAiServiceFromEnv(tmpDir)).not.toThrow();
    });
});

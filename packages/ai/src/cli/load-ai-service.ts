import * as dotenv from "dotenv";
import * as path from "path";
import { AiService } from "../ai.service";
import { AiConfig, AiDriver, AiProviderConfig } from "../ai.service";

const MODEL_ENV_VAR = "AI_MODEL";

interface DriverEnvConfig {
    apiKeyEnvVar?: string;
    /** Alternative to apiKeyEnvVar — currently only "anthropic" has one. See AnthropicProviderConfig.authToken. */
    authTokenEnvVar?: string;
    defaultModel?: string;
}

const DRIVER_ENV: Record<AiDriver, DriverEnvConfig> = {
    anthropic: { apiKeyEnvVar: "ANTHROPIC_API_KEY", authTokenEnvVar: "ANTHROPIC_AUTH_TOKEN" },
    openai: { apiKeyEnvVar: "OPENAI_API_KEY", defaultModel: "gpt-4o" },
    gemini: { apiKeyEnvVar: "GEMINI_API_KEY" },
    groq: { apiKeyEnvVar: "GROQ_API_KEY", defaultModel: "llama-3.3-70b-versatile" },
    deepseek: { apiKeyEnvVar: "DEEPSEEK_API_KEY", defaultModel: "deepseek-chat" },
    openrouter: { apiKeyEnvVar: "OPENROUTER_API_KEY", defaultModel: "anthropic/claude-sonnet-4.5" },
    ollama: { defaultModel: "llama3" },
};

/**
 * Builds an AiService directly from .env, without going through the DI
 * container — CLI commands never boot the app in-process (see
 * migrate.command.ts's own header comment for why), so there's no
 * ConfigService available here to read config/ai.ts from.
 */
export function loadAiServiceFromEnv(cwd: string = process.cwd()): AiService {
    dotenv.config({ path: path.join(cwd, ".env") });

    const driver = (process.env.AI_PROVIDER as AiDriver) || "anthropic";
    const envConfig = DRIVER_ENV[driver];
    if (!envConfig) {
        throw new Error(
            `[nyala/ai] Unknown AI_PROVIDER "${driver}". Supported: ${Object.keys(DRIVER_ENV).join(", ")}.`
        );
    }

    const apiKey = envConfig.apiKeyEnvVar ? process.env[envConfig.apiKeyEnvVar] : undefined;
    const authToken = envConfig.authTokenEnvVar ? process.env[envConfig.authTokenEnvVar] : undefined;

    if (envConfig.apiKeyEnvVar && !apiKey && !authToken) {
        const alsoTry = envConfig.authTokenEnvVar ? ` or ${envConfig.authTokenEnvVar}` : "";
        throw new Error(
            `[nyala/ai] No credentials found for provider "${driver}". Set ${envConfig.apiKeyEnvVar}${alsoTry} in your .env file.`
        );
    }

    const providerConfig: AiProviderConfig = {
        driver,
        apiKey,
        authToken,
        baseURL: process.env.AI_BASE_URL,
        defaultModel: process.env[MODEL_ENV_VAR] || envConfig.defaultModel,
    };

    const config: AiConfig = { default: "default", providers: { default: providerConfig } };

    const service = new AiService();
    service.connect(config);
    return service;
}

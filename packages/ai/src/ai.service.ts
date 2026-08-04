import { Injectable } from "@nyalajs/core";
import { AiProvider, AiMessage, AiCompletionOptions, AiCompletionResult } from "./providers/types";
import { RetryingAiProvider, RetryConfig, RateLimitConfig } from "./providers/retrying-provider";
import { AnthropicProvider } from "./providers/anthropic.provider";
import { OpenAiCompatibleProvider } from "./providers/openai-compatible.provider";
import { GeminiProvider } from "./providers/gemini.provider";

/** The drivers this package ships built-in support for. Custom drivers can be registered too — see AiService.registerProviderFactory(). */
export type AiDriver = "anthropic" | "openai" | "gemini" | "ollama" | "groq" | "deepseek" | "openrouter";

export interface AiProviderConfig {
    /** One of AiDriver, or a driver registered via AiService.registerProviderFactory(). */
    driver: string;
    apiKey?: string;
    /**
     * Bearer-token auth, as an alternative to apiKey — currently only
     * meaningful for the "anthropic" driver, which supports it as a
     * genuinely distinct auth mechanism (e.g. a token from a Claude
     * subscription rather than a separately-billed API key). See
     * AnthropicProviderConfig.authToken.
     */
    authToken?: string;
    /** Overrides the driver's default baseURL — mainly for Ollama's port or a self-hosted OpenRouter-compatible gateway. */
    baseURL?: string;
    defaultModel?: string;
}

export interface AiConfig {
    default: string;
    providers: Record<string, AiProviderConfig>;
    retry?: RetryConfig;
    rateLimit?: RateLimitConfig;
}

/**
 * Builds one AiProvider instance from config. Registering a factory for a
 * new driver name — see AiService.registerProviderFactory() — is the whole
 * extension mechanism for adding a vendor without editing this package.
 */
export interface AiProviderFactory {
    driver: string;
    build(config: AiProviderConfig, name: string): AiProvider;
}

interface OpenAiCompatiblePreset {
    baseURL?: string;
    requiresApiKey: boolean;
}

function openAiCompatibleFactory(driver: string, preset: OpenAiCompatiblePreset): AiProviderFactory {
    return {
        driver,
        build(config, name) {
            if (preset.requiresApiKey && !config.apiKey) {
                throw new Error(`[nyala/ai] provider "${name}" (${driver}) requires an apiKey.`);
            }
            if (!config.defaultModel) {
                throw new Error(
                    `[nyala/ai] provider "${name}" (${driver}) requires a defaultModel — there is no single sensible default across OpenAI-compatible vendors.`
                );
            }
            return new OpenAiCompatibleProvider(name, {
                apiKey: config.apiKey,
                baseURL: config.baseURL ?? preset.baseURL,
                defaultModel: config.defaultModel,
            });
        },
    };
}

const BUILT_IN_FACTORIES: AiProviderFactory[] = [
    {
        driver: "anthropic",
        build(config, name) {
            if (!config.apiKey && !config.authToken) {
                throw new Error(`[nyala/ai] provider "${name}" (anthropic) requires an apiKey or an authToken.`);
            }
            return new AnthropicProvider(
                { apiKey: config.apiKey, authToken: config.authToken, defaultModel: config.defaultModel },
                name
            );
        },
    },
    {
        driver: "gemini",
        build(config, name) {
            if (!config.apiKey) throw new Error(`[nyala/ai] provider "${name}" (gemini) requires an apiKey.`);
            return new GeminiProvider({ apiKey: config.apiKey, defaultModel: config.defaultModel }, name);
        },
    },
    openAiCompatibleFactory("openai", { requiresApiKey: true }),
    openAiCompatibleFactory("groq", { baseURL: "https://api.groq.com/openai/v1", requiresApiKey: true }),
    openAiCompatibleFactory("deepseek", { baseURL: "https://api.deepseek.com", requiresApiKey: true }),
    openAiCompatibleFactory("openrouter", { baseURL: "https://openrouter.ai/api/v1", requiresApiKey: true }),
    openAiCompatibleFactory("ollama", { baseURL: "http://localhost:11434/v1", requiresApiKey: false }),
];

/**
 * Facade over every configured AI provider — mirrors StorageService's
 * disk(name?) pattern: a `default` plus named alternates, each reachable by
 * name. Every provider gets wrapped in RetryingAiProvider at connect() time,
 * so retry/rate-limit behavior is never something a caller (or a new
 * provider driver) has to remember to add.
 *
 * Adding "Mistral" or any other OpenAI-compatible vendor to the built-ins
 * is a new factory in BUILT_IN_FACTORIES, not a new provider class — see
 * openai-compatible.provider.ts. Adding a driver from OUTSIDE this package
 * is registerProviderFactory() — the registry is shared (static) across all
 * AiService instances, matching how a plugin registers itself once, at
 * startup, not per-instance.
 */
@Injectable()
export class AiService implements AiProvider {
    readonly name = "ai";

    private static readonly factories = new Map<string, AiProviderFactory>(
        BUILT_IN_FACTORIES.map((factory) => [factory.driver, factory])
    );

    /** Registers (or overrides) a driver, available to every AiService instance. */
    static registerProviderFactory(factory: AiProviderFactory): void {
        AiService.factories.set(factory.driver, factory);
    }

    static getRegisteredDrivers(): string[] {
        return [...AiService.factories.keys()];
    }

    private defaultProviderName?: string;
    private providers = new Map<string, AiProvider>();

    connect(config?: AiConfig): void {
        // Re-connecting must fully replace the previous provider set, not
        // accumulate on top of it — otherwise a stale provider from an
        // earlier connect() call stays resolvable forever.
        this.providers.clear();
        this.defaultProviderName = undefined;
        if (!config) return;

        this.defaultProviderName = config.default;
        for (const [name, providerConfig] of Object.entries(config.providers)) {
            const raw = this.buildProvider(name, providerConfig);
            this.providers.set(name, new RetryingAiProvider(raw, config.retry, config.rateLimit));
        }
    }

    private buildProvider(name: string, config: AiProviderConfig): AiProvider {
        const factory = AiService.factories.get(config.driver);
        if (!factory) {
            throw new Error(
                `[nyala/ai] Unknown driver "${config.driver}" for provider "${name}". ` +
                `Registered drivers: ${AiService.getRegisteredDrivers().join(", ")}. ` +
                `Use AiService.registerProviderFactory() to add a new one.`
            );
        }
        return factory.build(config, name);
    }

    /** Get a specific provider by name, or the configured default. */
    provider(name?: string): AiProvider {
        const providerName = name ?? this.defaultProviderName;
        if (!providerName) {
            throw new Error("[nyala/ai] No AI provider configured. Call connect() with a default provider first.");
        }
        const provider = this.providers.get(providerName);
        if (!provider) {
            throw new Error(`[nyala/ai] Provider "${providerName}" is not configured.`);
        }
        return provider;
    }

    async complete(messages: AiMessage[], options?: AiCompletionOptions): Promise<AiCompletionResult> {
        return this.provider().complete(messages, options);
    }

    async *stream(messages: AiMessage[], options?: AiCompletionOptions): AsyncIterable<string> {
        yield* this.provider().stream(messages, options);
    }
}

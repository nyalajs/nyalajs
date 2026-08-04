import "reflect-metadata";
import { describe, it, expect, vi } from "vitest";
import { AiService } from "../ai.service";

describe("AiService", () => {
    it("throws a clear error when used before connect()", () => {
        const service = new AiService();
        expect(() => service.provider()).toThrow(/No AI provider configured/);
    });

    it("resolves the configured default provider, named after its config key", () => {
        const service = new AiService();
        service.connect({
            default: "main",
            providers: { main: { driver: "anthropic", apiKey: "key" } },
        });

        expect(service.provider().name).toBe("main");
    });

    it("resolves a named provider other than the default", () => {
        const service = new AiService();
        service.connect({
            default: "main",
            providers: {
                main: { driver: "anthropic", apiKey: "key" },
                fast: { driver: "openai", apiKey: "key", defaultModel: "gpt-4o-mini" },
            },
        });

        expect(service.provider("fast").name).toBe("fast");
    });

    it("distinguishes two same-driver providers by their config key, not the driver name", () => {
        const service = new AiService();
        service.connect({
            default: "cheap",
            providers: {
                cheap: { driver: "anthropic", apiKey: "key", defaultModel: "claude-haiku-4-5" },
                strong: { driver: "anthropic", apiKey: "key", defaultModel: "claude-opus-5" },
            },
        });

        expect(service.provider("cheap").name).toBe("cheap");
        expect(service.provider("strong").name).toBe("strong");
    });

    it("throws a clear error for an unconfigured provider name", () => {
        const service = new AiService();
        service.connect({ default: "main", providers: { main: { driver: "anthropic", apiKey: "key" } } });

        expect(() => service.provider("does-not-exist")).toThrow(/not configured/);
    });

    it("requires an apiKey (or authToken) for anthropic", () => {
        const service = new AiService();
        expect(() =>
            service.connect({ default: "main", providers: { main: { driver: "anthropic" } } })
        ).toThrow(/requires an apiKey/);
    });

    it("accepts authToken alone for anthropic, with no apiKey", () => {
        const service = new AiService();
        expect(() =>
            service.connect({ default: "main", providers: { main: { driver: "anthropic", authToken: "oauth-token" } } })
        ).not.toThrow();
        expect(service.provider().name).toBe("main");
    });

    it("requires an apiKey for gemini", () => {
        const service = new AiService();
        expect(() =>
            service.connect({ default: "main", providers: { main: { driver: "gemini" } } })
        ).toThrow(/requires an apiKey/);
    });

    it("does not require an apiKey for ollama", () => {
        const service = new AiService();
        expect(() =>
            service.connect({
                default: "main",
                providers: { main: { driver: "ollama", defaultModel: "llama3" } },
            })
        ).not.toThrow();
    });

    it("requires an apiKey for groq/deepseek/openrouter", () => {
        const service = new AiService();
        for (const driver of ["groq", "deepseek", "openrouter"] as const) {
            expect(() =>
                service.connect({ default: "main", providers: { main: { driver, defaultModel: "x" } } })
            ).toThrow(/requires an apiKey/);
        }
    });

    it("requires a defaultModel for every OpenAI-compatible driver", () => {
        const service = new AiService();
        expect(() =>
            service.connect({ default: "main", providers: { main: { driver: "openai", apiKey: "key" } } })
        ).toThrow(/requires a defaultModel/);
    });

    it("delegates complete() to the default provider", async () => {
        const service = new AiService();
        service.connect({
            default: "main",
            providers: { main: { driver: "anthropic", apiKey: "key" } },
        });

        const spy = vi.spyOn(service.provider(), "complete").mockResolvedValue({ text: "hi", model: "m" });
        const result = await service.complete([{ role: "user", content: "hello" }]);

        expect(spy).toHaveBeenCalled();
        expect(result.text).toBe("hi");
    });

    it("re-connecting replaces the previous provider set", () => {
        const service = new AiService();
        service.connect({ default: "a", providers: { a: { driver: "anthropic", apiKey: "key" } } });
        service.connect({ default: "b", providers: { b: { driver: "gemini", apiKey: "key" } } });

        expect(() => service.provider("a")).toThrow(/not configured/);
        expect(service.provider("b").name).toBe("b");
    });

    it("connect() with no config is a safe no-op (provider() still throws its own clear error)", () => {
        const service = new AiService();
        expect(() => service.connect()).not.toThrow();
        expect(() => service.provider()).toThrow(/No AI provider configured/);
    });

    it("throws a clear, actionable error for a truly unknown driver", () => {
        const service = new AiService();
        expect(() =>
            service.connect({ default: "main", providers: { main: { driver: "not-a-real-driver" } } })
        ).toThrow(/Unknown driver "not-a-real-driver".*registerProviderFactory/s);
    });
});

describe("AiService — provider registry", () => {
    it("lists the 7 built-in drivers by default", () => {
        const drivers = AiService.getRegisteredDrivers();
        for (const driver of ["anthropic", "gemini", "openai", "groq", "deepseek", "openrouter", "ollama"]) {
            expect(drivers).toContain(driver);
        }
    });

    it("registerProviderFactory() makes a brand-new driver usable via connect()", () => {
        // A well-behaved factory uses the `name` it's given (the config key)
        // as the built provider's own .name, same as every built-in factory does.
        const buildSpy = vi.fn().mockImplementation((_config, name: string) => ({
            name,
            complete: vi.fn(),
            stream: vi.fn(),
        }));

        AiService.registerProviderFactory({ driver: "test-custom-driver", build: buildSpy });

        const service = new AiService();
        service.connect({
            default: "main",
            providers: { main: { driver: "test-custom-driver", apiKey: "whatever-this-driver-wants" } },
        });

        expect(buildSpy).toHaveBeenCalledWith(
            { driver: "test-custom-driver", apiKey: "whatever-this-driver-wants" },
            "main"
        );
        expect(service.provider().name).toBe("main"); // wrapped in RetryingAiProvider, which takes the config-key name
        expect(AiService.getRegisteredDrivers()).toContain("test-custom-driver");
    });

    it("registering a factory for an existing driver name overrides it", () => {
        const fakeProvider = { name: "overridden", complete: vi.fn(), stream: vi.fn() };
        const buildSpy = vi.fn().mockReturnValue(fakeProvider);

        AiService.registerProviderFactory({ driver: "test-override-driver", build: buildSpy });
        AiService.registerProviderFactory({ driver: "test-override-driver", build: buildSpy }); // registering twice is safe

        expect(AiService.getRegisteredDrivers().filter((d) => d === "test-override-driver")).toHaveLength(1);
    });

    it("a registered factory is usable across multiple AiService instances (registry is shared, not per-instance)", () => {
        const buildSpy = vi.fn().mockReturnValue({ name: "shared", complete: vi.fn(), stream: vi.fn() });
        AiService.registerProviderFactory({ driver: "test-shared-driver", build: buildSpy });

        const serviceA = new AiService();
        const serviceB = new AiService();
        serviceA.connect({ default: "x", providers: { x: { driver: "test-shared-driver" } } });
        serviceB.connect({ default: "y", providers: { y: { driver: "test-shared-driver" } } });

        expect(buildSpy).toHaveBeenCalledTimes(2);
    });
});

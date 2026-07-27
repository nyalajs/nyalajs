import "reflect-metadata";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Req, Res, Body, Param, Query } from "@nyalajs/core";
import { FastifyAdapter } from "../runtime/fastify-adapter";

function mockContainer() {
    return {
        createRequestScope: vi.fn(),
        resolve: vi.fn()
    } as any;
}

describe("FastifyAdapter", () => {
    it("initializes without errors when sessions are disabled", () => {
        const adapter = new FastifyAdapter(mockContainer(), { session: false });
        expect(adapter).toBeDefined();
    });

    it("registers middleware in the correct order", () => {
        const adapter = new FastifyAdapter(mockContainer(), { session: false });

        let order: string[] = [];

        const mw1 = {
            use: async (req: any, res: any, next: any) => {
                order.push("mw1");
                await next();
            }
        };

        const mw2 = {
            use: async (req: any, res: any, next: any) => {
                order.push("mw2");
                await next();
            }
        };

        adapter.addMiddleware(mw1);
        adapter.addMiddleware(mw2);

        // This is a unit test of the adapter state; actual execution is harder
        // to test without full Fastify instance spinup.
        expect((adapter as any).globalMiddleware).toHaveLength(2);
        expect((adapter as any).globalMiddleware[0]).toBe(mw1);
    });

    describe("session secret/salt", () => {
        const originalSecret = process.env.SESSION_SECRET;
        const originalSalt = process.env.SESSION_SALT;

        afterEach(() => {
            process.env.SESSION_SECRET = originalSecret;
            process.env.SESSION_SALT = originalSalt;
        });

        it("throws instead of defaulting when SESSION_SECRET is unset", () => {
            delete process.env.SESSION_SECRET;
            delete process.env.SESSION_SALT;

            expect(() => new FastifyAdapter(mockContainer())).toThrow(/SESSION_SECRET/);
        });

        it("throws when SESSION_SALT is missing or the wrong length", () => {
            process.env.SESSION_SECRET = "a".repeat(32);
            delete process.env.SESSION_SALT;

            expect(() => new FastifyAdapter(mockContainer())).toThrow(/SESSION_SALT/);
        });

        it("succeeds when both SESSION_SECRET and SESSION_SALT are valid", () => {
            process.env.SESSION_SECRET = "a".repeat(32);
            process.env.SESSION_SALT = "1234567890123456";

            expect(() => new FastifyAdapter(mockContainer())).not.toThrow();
        });
    });

    describe("default CORS", () => {
        it("does not reflect a cross-origin request's Origin header by default", async () => {
            const adapter = new FastifyAdapter(mockContainer(), { session: false, csrf: false });
            const instance = adapter.getInstance();
            instance.get("/ping", async () => ({ ok: true }));

            const res = await instance.inject({
                method: "GET",
                url: "/ping",
                headers: { origin: "https://evil.example" },
            });

            expect(res.headers["access-control-allow-origin"]).toBeUndefined();
        });

        it("reflects the Origin only when corsOrigin is explicitly configured", async () => {
            const adapter = new FastifyAdapter(mockContainer(), {
                session: false,
                csrf: false,
                corsOrigin: "https://trusted.example",
            });
            const instance = adapter.getInstance();
            instance.get("/ping", async () => ({ ok: true }));

            const res = await instance.inject({
                method: "GET",
                url: "/ping",
                headers: { origin: "https://trusted.example" },
            });

            expect(res.headers["access-control-allow-origin"]).toBe("https://trusted.example");
        });
    });

    describe("form body parsing", () => {
        it("parses a plain HTML <form method=\"POST\"> (application/x-www-form-urlencoded) submission into request.body", async () => {
            class LoginController {
                login(body: any) {
                    return { received: body };
                }
            }

            const controllerInstance = new LoginController();
            const requestContainer = {
                register: vi.fn(),
                resolve: (token: any) => (token === LoginController ? controllerInstance : undefined),
            };
            const container = {
                createRequestScope: () => requestContainer,
                resolve: vi.fn(),
            } as any;

            const adapter = new FastifyAdapter(container, { session: false, csrf: false });
            adapter.registerResolvedRoutes([
                { method: "POST", path: "/login", controller: LoginController, handlerName: "login", guards: [], interceptors: [] },
            ]);

            const res = await adapter.getInstance().inject({
                method: "POST",
                url: "/login",
                headers: { "content-type": "application/x-www-form-urlencoded" },
                payload: "email=admin%40example.com&password=hunter2",
            });

            expect(res.statusCode).toBe(200);
            expect(JSON.parse(res.body)).toEqual({
                received: { email: "admin@example.com", password: "hunter2" },
            });
        });
    });

    describe("@Res() — manual reply handling (e.g. redirects)", () => {
        it("resolves @Res() to the real Fastify reply, and doesn't double-send when the handler replies directly", async () => {
            class RedirectController {
                login(@Req() _req: any, @Res() res: any) {
                    return res.redirect(302, "/admin");
                }
            }

            const controllerInstance = new RedirectController();
            const requestContainer = {
                register: vi.fn(),
                resolve: (token: any) => (token === RedirectController ? controllerInstance : undefined),
            };
            const container = {
                createRequestScope: () => requestContainer,
                resolve: vi.fn(),
            } as any;

            const adapter = new FastifyAdapter(container, { session: false, csrf: false });
            adapter.registerResolvedRoutes([
                { method: "POST", path: "/login", controller: RedirectController, handlerName: "login", guards: [], interceptors: [] },
            ]);

            const res = await adapter.getInstance().inject({ method: "POST", url: "/login" });

            expect(res.statusCode).toBe(302);
            expect(res.headers.location).toBe("/admin");
        });

        it("resolves @Body()/@Param()/@Query() to the right named values, not positional (body, params, query)", async () => {
            class ResourceController {
                update(@Param("id") id: string, @Body() body: any, @Query("page") page: string) {
                    return { id, body, page };
                }
            }

            const controllerInstance = new ResourceController();
            const requestContainer = {
                register: vi.fn(),
                resolve: (token: any) => (token === ResourceController ? controllerInstance : undefined),
            };
            const container = {
                createRequestScope: () => requestContainer,
                resolve: vi.fn(),
            } as any;

            const adapter = new FastifyAdapter(container, { session: false, csrf: false });
            adapter.registerResolvedRoutes([
                { method: "POST", path: "/items/:id", controller: ResourceController, handlerName: "update", guards: [], interceptors: [] },
            ]);

            const res = await adapter.getInstance().inject({
                method: "POST",
                url: "/items/abc123?page=2",
                payload: { title: "New title" },
            });

            expect(res.statusCode).toBe(200);
            expect(JSON.parse(res.body)).toEqual({
                id: "abc123",
                body: { title: "New title" },
                page: "2",
            });
        });
    });

    describe("RenderableResponse", () => {
        it("sends the rendered body as text/html instead of JSON-serializing it", async () => {
            class ViewController {
                index() {
                    return {
                        contentType: "text/html",
                        statusCode: 201,
                        render: () => "<!DOCTYPE html><html><body>Hi</body></html>",
                    };
                }
            }

            const controllerInstance = new ViewController();
            const requestContainer = {
                register: vi.fn(),
                resolve: (token: any) => (token === ViewController ? controllerInstance : undefined),
            };
            const container = {
                createRequestScope: () => requestContainer,
                resolve: vi.fn(),
            } as any;

            const adapter = new FastifyAdapter(container, { session: false, csrf: false });
            adapter.registerResolvedRoutes([
                { method: "GET", path: "/view-test", controller: ViewController, handlerName: "index", guards: [], interceptors: [] },
            ]);

            const res = await adapter.getInstance().inject({ method: "GET", url: "/view-test" });

            expect(res.statusCode).toBe(201);
            expect(res.headers["content-type"]).toContain("text/html");
            expect(res.body).toBe("<!DOCTYPE html><html><body>Hi</body></html>");
        });
    });

    describe("error content negotiation", () => {
        class ThrowingController {
            index() {
                throw new Error("boom");
            }
        }

        function adapterWithThrowingRoute(options: ConstructorParameters<typeof FastifyAdapter>[1] = {}) {
            const controllerInstance = new ThrowingController();
            const requestContainer = {
                register: vi.fn(),
                resolve: (token: any) => (token === ThrowingController ? controllerInstance : undefined),
            };
            const container = {
                createRequestScope: () => requestContainer,
                resolve: vi.fn(),
            } as any;

            const adapter = new FastifyAdapter(container, { session: false, csrf: false, ...options });
            adapter.registerResolvedRoutes([
                { method: "GET", path: "/boom", controller: ThrowingController, handlerName: "index", guards: [], interceptors: [] },
            ]);
            return adapter;
        }

        it("still sends JSON for a client that doesn't ask for HTML (no regression for API clients)", async () => {
            const adapter = adapterWithThrowingRoute();
            const res = await adapter.getInstance().inject({
                method: "GET",
                url: "/boom",
                headers: { accept: "application/json" },
            });

            expect(res.statusCode).toBe(500);
            expect(res.headers["content-type"]).toContain("application/json");
            expect(JSON.parse(res.body).message).toBe("boom");
        });

        it("sends a built-in HTML error page for a browser-like Accept header", async () => {
            const adapter = adapterWithThrowingRoute();
            const res = await adapter.getInstance().inject({
                method: "GET",
                url: "/boom",
                headers: { accept: "text/html,application/xhtml+xml" },
            });

            expect(res.statusCode).toBe(500);
            expect(res.headers["content-type"]).toContain("text/html");
            expect(res.body).toContain("<!DOCTYPE html>");
            expect(res.body).not.toContain('"message"'); // not a JSON blob
        });

        it("uses a custom errorView when provided", async () => {
            const adapter = adapterWithThrowingRoute({
                errorView: (error, statusCode) => `<!DOCTYPE html><html><body>Custom ${statusCode}: ${error.message}</body></html>`,
            });
            const res = await adapter.getInstance().inject({
                method: "GET",
                url: "/boom",
                headers: { accept: "text/html" },
            });

            expect(res.body).toBe("<!DOCTYPE html><html><body>Custom 500: boom</body></html>");
        });
    });

    describe("rendering with the framework's actual hardened defaults", () => {
        // helmet, session, and csrf are all *on* here (the real defaults —
        // nothing disabled), unlike every other test in this file, which
        // turns them off to isolate what's under test. This is the one
        // place we prove the rendering layer doesn't fight the security
        // defaults built earlier this session.
        const originalSecret = process.env.SESSION_SECRET;
        const originalSalt = process.env.SESSION_SALT;

        beforeEach(() => {
            process.env.SESSION_SECRET = "a".repeat(32);
            process.env.SESSION_SALT = "1234567890123456";
        });

        afterEach(() => {
            process.env.SESSION_SECRET = originalSecret;
            process.env.SESSION_SALT = originalSalt;
        });

        it("still serves a RenderableResponse as HTML, with a CSP that permits same-origin dynamic import() (what the island bootstrap script needs)", async () => {
            class ViewController {
                index() {
                    return {
                        contentType: "text/html",
                        render: () => "<!DOCTYPE html><html><body><h1>Hi</h1></body></html>",
                    };
                }
            }

            const controllerInstance = new ViewController();
            const requestContainer = {
                register: vi.fn(),
                resolve: (token: any) => (token === ViewController ? controllerInstance : undefined),
            };
            const container = {
                createRequestScope: () => requestContainer,
                resolve: vi.fn(),
            } as any;

            // No overrides at all — this is FastifyAdapter's real default posture.
            const adapter = new FastifyAdapter(container);
            adapter.registerResolvedRoutes([
                { method: "GET", path: "/", controller: ViewController, handlerName: "index", guards: [], interceptors: [] },
            ]);

            const res = await adapter.getInstance().inject({ method: "GET", url: "/" });

            expect(res.statusCode).toBe(200);
            expect(res.headers["content-type"]).toContain("text/html");
            expect(res.body).toBe("<!DOCTYPE html><html><body><h1>Hi</h1></body></html>");

            // helmet's CSP (unmodified default from setupSecurityDefaults)
            const csp = res.headers["content-security-policy"] as string;
            expect(csp).toBeDefined();
            expect(csp).toContain("script-src 'self'");
            // NOTE: .inject() doesn't run a real browser — this confirms the
            // *header* is compatible with the bootstrap script's same-origin
            // dynamic import(), not that hydration actually executes.
        });
    });
});

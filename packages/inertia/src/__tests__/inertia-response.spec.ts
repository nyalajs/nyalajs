import { describe, it, expect } from "vitest";
import { InertiaResponse } from "../inertia-response";
import { AssetVersionResolver } from "../asset-version";
import { shareProps } from "../shared-props";
import { flash, flashValidationErrors } from "../flash";
import { fakeRequest, fakeReply, fakeSession } from "./test-helpers";

function devAssets(): AssetVersionResolver {
    return new AssetVersionResolver({ outDir: "/nonexistent", dev: true });
}

function baseHtmlOptions() {
    return { entry: "app/main.tsx", assets: devAssets() };
}

describe("InertiaResponse — contentType / X-Inertia branching", () => {
    it("is text/html for a non-Inertia (hard navigation) request", () => {
        const req = fakeRequest({ headers: {} });
        const res = new InertiaResponse("Home", {}, req, { version: null, html: baseHtmlOptions() });

        expect(res.contentType).toBe("text/html");
    });

    it("is application/json for a genuine Inertia (X-Inertia: true) request", () => {
        const req = fakeRequest({ headers: { "x-inertia": "true" } });
        const res = new InertiaResponse("Home", {}, req, { version: null, html: baseHtmlOptions() });

        expect(res.contentType).toBe("application/json");
    });

    it("renders a full HTML document (starting with <!DOCTYPE html>) for a hard navigation", async () => {
        const req = fakeRequest({ headers: {} });
        const res = new InertiaResponse("Home", { greeting: "hi" }, req, {
            version: null,
            html: baseHtmlOptions(),
        });

        const body = await res.render();
        expect(body.startsWith("<!DOCTYPE html>")).toBe(true);
    });

    it("embeds the Page object as JSON in the root div's data-page attribute", async () => {
        const req = fakeRequest({ headers: {}, url: "/dashboard" });
        const res = new InertiaResponse("Dashboard", { count: 42 }, req, {
            version: "v1",
            html: baseHtmlOptions(),
        });

        const body = await res.render();
        const match = body.match(/data-page="([^"]*)"/);
        expect(match).not.toBeNull();

        const decoded = match![1].replace(/&quot;/g, '"');
        const page = JSON.parse(decoded);

        expect(page.component).toBe("Dashboard");
        expect(page.props.count).toBe(42);
        expect(page.url).toBe("/dashboard");
        expect(page.version).toBe("v1");
        expect(page.props.errors).toEqual({});
    });

    it("renders raw JSON matching the Page shape for a genuine Inertia request", async () => {
        const req = fakeRequest({ headers: { "x-inertia": "true", "x-inertia-version": "v1" }, url: "/users" });
        const res = new InertiaResponse("Users/Index", { total: 3 }, req, {
            version: "v1",
            html: baseHtmlOptions(),
        });

        const body = await res.render();
        const page = JSON.parse(body);

        expect(page).toMatchObject({
            component: "Users/Index",
            props: { total: 3, errors: {} },
            url: "/users",
            version: "v1",
            clearHistory: false,
            encryptHistory: false,
        });
    });
});

describe("InertiaResponse — 409 stale asset version protocol", () => {
    it("does not 409 a hard navigation even when no version header is present", async () => {
        const req = fakeRequest({ headers: {} });
        const res = new InertiaResponse("Home", {}, req, { version: "v2", html: baseHtmlOptions() });

        await res.render();
        expect(res.statusCode).toBeUndefined();
    });

    it("does not 409 when the client's X-Inertia-Version matches the server's", async () => {
        const req = fakeRequest({ headers: { "x-inertia": "true", "x-inertia-version": "v2" } });
        const res = new InertiaResponse("Home", {}, req, { version: "v2", html: baseHtmlOptions() });

        await res.render();
        expect(res.statusCode).toBeUndefined();
    });

    it("409s an Inertia request when X-Inertia-Version doesn't match the current version", async () => {
        const req = fakeRequest({
            headers: { "x-inertia": "true", "x-inertia-version": "stale" },
            url: "/dashboard",
        });
        const res = new InertiaResponse("Home", {}, req, { version: "v2", html: baseHtmlOptions() });

        const body = await res.render();

        expect(res.statusCode).toBe(409);
        expect(body).toBe("");
    });

    it("409s when the client sends no version header at all but the server has one", async () => {
        const req = fakeRequest({ headers: { "x-inertia": "true" } });
        const res = new InertiaResponse("Home", {}, req, { version: "v2", html: baseHtmlOptions() });

        await res.render();
        expect(res.statusCode).toBe(409);
    });

    it("sets X-Inertia-Location to the request URL on a 409, via the reply", async () => {
        const req = fakeRequest({
            headers: { "x-inertia": "true", "x-inertia-version": "stale" },
            url: "/dashboard?tab=billing",
        });
        const reply = fakeReply();
        const res = new InertiaResponse("Home", {}, req, {
            version: "v2",
            html: baseHtmlOptions(),
            reply,
        });

        await res.render();

        expect(reply.headers["X-Inertia-Location"]).toBe("/dashboard?tab=billing");
    });

    it("does not throw or set a header when no reply was provided on a 409", async () => {
        const req = fakeRequest({ headers: { "x-inertia": "true", "x-inertia-version": "stale" } });
        const res = new InertiaResponse("Home", {}, req, { version: "v2", html: baseHtmlOptions() });

        await expect(res.render()).resolves.toBe("");
    });

    it("both server and client having null version is not a mismatch (dev mode)", async () => {
        const req = fakeRequest({ headers: { "x-inertia": "true" } });
        const res = new InertiaResponse("Home", {}, req, { version: null, html: baseHtmlOptions() });

        await res.render();
        expect(res.statusCode).toBeUndefined();
    });
});

describe("InertiaResponse — partial reloads", () => {
    it("includes only the props named in X-Inertia-Partial-Data when the partial component matches", async () => {
        const req = fakeRequest({
            headers: {
                "x-inertia": "true",
                "x-inertia-partial-component": "Users/Index",
                "x-inertia-partial-data": "users",
            },
        });
        const res = new InertiaResponse("Users/Index", { users: ["a"], stats: { total: 1 } }, req, {
            version: null,
            html: baseHtmlOptions(),
        });

        const page = JSON.parse(await res.render());
        expect(page.props.users).toEqual(["a"]);
        expect(page.props.stats).toBeUndefined();
    });

    it("excludes the props named in X-Inertia-Partial-Except when the partial component matches", async () => {
        const req = fakeRequest({
            headers: {
                "x-inertia": "true",
                "x-inertia-partial-component": "Users/Index",
                "x-inertia-partial-except": "stats",
            },
        });
        const res = new InertiaResponse("Users/Index", { users: ["a"], stats: { total: 1 } }, req, {
            version: null,
            html: baseHtmlOptions(),
        });

        const page = JSON.parse(await res.render());
        expect(page.props.users).toEqual(["a"]);
        expect(page.props.stats).toBeUndefined();
    });

    it("ignores partial-data filtering when X-Inertia-Partial-Component names a different page", async () => {
        const req = fakeRequest({
            headers: {
                "x-inertia": "true",
                "x-inertia-partial-component": "Posts/Index",
                "x-inertia-partial-data": "users",
            },
        });
        const res = new InertiaResponse("Users/Index", { users: ["a"], stats: { total: 1 } }, req, {
            version: null,
            html: baseHtmlOptions(),
        });

        const page = JSON.parse(await res.render());
        expect(page.props.users).toEqual(["a"]);
        expect(page.props.stats).toEqual({ total: 1 });
    });

    it("does not evaluate a lazy prop thunk excluded by a partial reload", async () => {
        let called = false;
        const req = fakeRequest({
            headers: {
                "x-inertia": "true",
                "x-inertia-partial-component": "Users/Index",
                "x-inertia-partial-data": "users",
            },
        });
        const res = new InertiaResponse(
            "Users/Index",
            {
                users: ["a"],
                expensive: () => {
                    called = true;
                    return "computed";
                },
            },
            req,
            { version: null, html: baseHtmlOptions() }
        );

        await res.render();
        expect(called).toBe(false);
    });

    it("evaluates a lazy prop thunk (sync or async) when it's included", async () => {
        const req = fakeRequest({ headers: { "x-inertia": "true" } });
        const res = new InertiaResponse(
            "Users/Index",
            {
                sync: () => "sync-value",
                async: async () => "async-value",
            },
            req,
            { version: null, html: baseHtmlOptions() }
        );

        const page = JSON.parse(await res.render());
        expect(page.props.sync).toBe("sync-value");
        expect(page.props.async).toBe("async-value");
    });

    it("a full (non-partial) reload includes every prop", async () => {
        const req = fakeRequest({ headers: { "x-inertia": "true" } });
        const res = new InertiaResponse("Users/Index", { users: ["a"], stats: { total: 1 } }, req, {
            version: null,
            html: baseHtmlOptions(),
        });

        const page = JSON.parse(await res.render());
        expect(page.props.users).toEqual(["a"]);
        expect(page.props.stats).toEqual({ total: 1 });
    });
});

describe("InertiaResponse — shared props", () => {
    it("merges shared props into the page props", async () => {
        const req = fakeRequest({ headers: { "x-inertia": "true" } });
        shareProps(req, { user: { id: 1, name: "Ada" } });

        const res = new InertiaResponse("Dashboard", { widgets: [] }, req, {
            version: null,
            html: baseHtmlOptions(),
        });

        const page = JSON.parse(await res.render());
        expect(page.props.user).toEqual({ id: 1, name: "Ada" });
        expect(page.props.widgets).toEqual([]);
    });

    it("lets an explicit per-response prop win over a same-named shared prop", async () => {
        const req = fakeRequest({ headers: { "x-inertia": "true" } });
        shareProps(req, { title: "Shared Title" });

        const res = new InertiaResponse("Dashboard", { title: "Specific Title" }, req, {
            version: null,
            html: baseHtmlOptions(),
        });

        const page = JSON.parse(await res.render());
        expect(page.props.title).toBe("Specific Title");
    });

    it("accumulates props from multiple shareProps() calls on the same request", async () => {
        const req = fakeRequest({ headers: { "x-inertia": "true" } });
        shareProps(req, { user: { id: 1 } });
        shareProps(req, { settings: { theme: "dark" } });

        const res = new InertiaResponse("Dashboard", {}, req, { version: null, html: baseHtmlOptions() });

        const page = JSON.parse(await res.render());
        expect(page.props.user).toEqual({ id: 1 });
        expect(page.props.settings).toEqual({ theme: "dark" });
    });
});

describe("InertiaResponse — flash messages", () => {
    it("populates props.flash from a flashed message, and clears it (read-once)", async () => {
        const session = fakeSession();
        const req = fakeRequest({ headers: { "x-inertia": "true" }, session });
        flash(req, "success", "Post created");

        const res = new InertiaResponse("Posts/Index", {}, req, { version: null, html: baseHtmlOptions() });
        const page = JSON.parse(await res.render());

        expect(page.props.flash).toEqual({ success: "Post created" });
        expect(session.get("__nyala_flash")).toEqual({});
    });

    it("props.flash is an empty object when nothing was flashed", async () => {
        const session = fakeSession();
        const req = fakeRequest({ headers: { "x-inertia": "true" }, session });

        const res = new InertiaResponse("Posts/Index", {}, req, { version: null, html: baseHtmlOptions() });
        const page = JSON.parse(await res.render());

        expect(page.props.flash).toEqual({});
    });

    it("props.flash is an empty object when sessions aren't enabled at all", async () => {
        const req = fakeRequest({ headers: { "x-inertia": "true" } });

        const res = new InertiaResponse("Posts/Index", {}, req, { version: null, html: baseHtmlOptions() });
        const page = JSON.parse(await res.render());

        expect(page.props.flash).toEqual({});
    });
});

describe("InertiaResponse — validation errors", () => {
    it("populates props.errors from flashed validation errors, and clears them (read-once)", async () => {
        const session = fakeSession();
        const req = fakeRequest({ headers: { "x-inertia": "true" }, session });
        flashValidationErrors(req, { email: "Invalid email format" });

        const res = new InertiaResponse("Posts/Create", {}, req, { version: null, html: baseHtmlOptions() });
        const page = JSON.parse(await res.render());

        expect(page.props.errors).toEqual({ email: "Invalid email format" });
        expect(session.get("__nyala_validation_errors")).toEqual({});
    });

    it("namespaces errors under X-Inertia-Error-Bag when present", async () => {
        const session = fakeSession();
        const req = fakeRequest({
            headers: { "x-inertia": "true", "x-inertia-error-bag": "loginForm" },
            session,
        });
        flashValidationErrors(req, { password: "Required" });

        const res = new InertiaResponse("Login", {}, req, { version: null, html: baseHtmlOptions() });
        const page = JSON.parse(await res.render());

        expect(page.props.errors).toEqual({ loginForm: { password: "Required" } });
    });

    it("props.errors is an empty object when nothing was flashed", async () => {
        const req = fakeRequest({ headers: { "x-inertia": "true" } });
        const res = new InertiaResponse("Posts/Create", {}, req, { version: null, html: baseHtmlOptions() });

        const page = JSON.parse(await res.render());
        expect(page.props.errors).toEqual({});
    });
});

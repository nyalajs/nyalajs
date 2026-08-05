import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { inertia, configureInertia, resetInertiaConfig } from "../inertia";
import { InertiaResponse } from "../inertia-response";
import { AssetVersionResolver } from "../asset-version";
import { fakeRequest } from "./test-helpers";

describe("inertia() helper", () => {
    afterEach(() => {
        resetInertiaConfig();
    });

    it("throws a clear error when called before configureInertia()", () => {
        const req = fakeRequest();
        expect(() => inertia(req, undefined, "Home", {})).toThrow(/configureInertia\(\) ran/);
    });

    it("returns an InertiaResponse once configured", () => {
        configureInertia({
            assets: new AssetVersionResolver({ outDir: "/nonexistent", dev: true }),
            html: { entry: "app/main.tsx" },
        });

        const req = fakeRequest();
        const result = inertia(req, undefined, "Home", { greeting: "hi" });

        expect(result).toBeInstanceOf(InertiaResponse);
    });

    it("mirrors view()'s ergonomics: call it, return the result, done — renders real content", async () => {
        configureInertia({
            assets: new AssetVersionResolver({ outDir: "/nonexistent", dev: true }),
            html: { entry: "app/main.tsx" },
        });

        // x-inertia-version must match the configured resolver's current
        // version ("dev" in dev mode) — otherwise InertiaResponse correctly
        // treats this as a stale-asset 409, per real Inertia protocol.
        const req = fakeRequest({ headers: { "x-inertia": "true", "x-inertia-version": "dev" } });
        const result = inertia(req, undefined, "Users/Index", { users: [] });
        const page = JSON.parse(await result.render());

        expect(page.component).toBe("Users/Index");
        expect(page.props.users).toEqual([]);
    });

    it("uses the configured asset resolver's version for every call", async () => {
        configureInertia({
            assets: new AssetVersionResolver({ outDir: "/nonexistent", dev: true }),
            html: { entry: "app/main.tsx" },
        });

        const req = fakeRequest({ headers: { "x-inertia": "true", "x-inertia-version": "dev" } });
        const page = JSON.parse(await inertia(req, undefined, "Home", {}).render());

        expect(page.version).toBe("dev");
    });
});

describe("configureInertia()/resetInertiaConfig()", () => {
    beforeEach(() => {
        resetInertiaConfig();
    });

    it("resetInertiaConfig() makes inertia() throw again", () => {
        configureInertia({
            assets: new AssetVersionResolver({ outDir: "/nonexistent", dev: true }),
            html: { entry: "app/main.tsx" },
        });
        resetInertiaConfig();

        expect(() => inertia(fakeRequest(), undefined, "Home", {})).toThrow();
    });
});

import { describe, it, expect } from "vitest";
import { resolvePageComponent } from "../client/resolve-page-component";

describe("resolvePageComponent()", () => {
    it("resolves an eager glob entry (module with a default export) by exact path match", async () => {
        function HomePage() {}
        const glob = { "./pages/Home.tsx": { default: HomePage } };

        const resolved = await resolvePageComponent("./pages/Home.tsx", glob);
        expect(resolved).toBe(HomePage);
    });

    it("resolves a lazy glob entry (thunk returning a Promise<module>)", async () => {
        function UsersIndex() {}
        const glob = {
            "./pages/Users/Index.tsx": () => Promise.resolve({ default: UsersIndex }),
        };

        const resolved = await resolvePageComponent("./pages/Users/Index.tsx", glob);
        expect(resolved).toBe(UsersIndex);
    });

    it("matches by suffix when the candidate path doesn't exactly equal a glob key", async () => {
        function Dashboard() {}
        // Vite's glob root is often "./pages/**/*.tsx" — the key includes
        // the full relative path from the glob call site, which may not be
        // byte-identical to what a caller constructs from a page name.
        const glob = { "./pages/Dashboard.tsx": { default: Dashboard } };

        const resolved = await resolvePageComponent("/pages/Dashboard.tsx", glob);
        expect(resolved).toBe(Dashboard);
    });

    it("unwraps a module without a default export by returning it as-is", async () => {
        const NamedOnly = { Named: () => {} };
        const glob = { "./pages/Named.tsx": NamedOnly };

        const resolved = await resolvePageComponent("./pages/Named.tsx", glob);
        expect(resolved).toBe(NamedOnly);
    });

    it("tries multiple candidate paths in order and resolves the first match", async () => {
        function Found() {}
        const glob = { "./pages/Real.tsx": { default: Found } };

        const resolved = await resolvePageComponent(["./pages/Missing.tsx", "./pages/Real.tsx"], glob);
        expect(resolved).toBe(Found);
    });

    it("throws a descriptive error when no candidate matches any glob entry", async () => {
        const glob = { "./pages/Other.tsx": { default: () => {} } };

        await expect(resolvePageComponent("./pages/Missing.tsx", glob)).rejects.toThrow(
            /Page component not found.*Missing\.tsx/
        );
    });

    it("throws when the glob object is empty", async () => {
        await expect(resolvePageComponent("./pages/Anything.tsx", {})).rejects.toThrow(/Page component not found/);
    });
});

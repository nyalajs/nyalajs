import "reflect-metadata";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { view, island, defineIsland, setIslandFileManifest } from "@nyalajs/react";
import { buildIslands } from "@nyalajs/react/build";
import { SiteLayout } from "../app/views/layout";
import { AdminLayout } from "../app/views/admin-layout";
import { SessionAuthGuard } from "../app/guards/session-auth.guard";
import { CategoriesController } from "../app/controllers/admin/categories.controller";
import { islands as islandManifest } from "../app/islands/manifest";
import MenuReorder from "../app/islands/menu-reorder";

function fakeReply() {
    return { redirect: (_code: number, _url: string) => undefined };
}

// ── Layouts render ──────────────────────────────────────────────────────
describe("layouts", () => {
    it("SiteLayout renders header nav, children, and footer", () => {
        const html = view(
            SiteLayout as any,
            {
                siteName: "My Site",
                footerText: "© test",
                headerNav: [{ label: "Blog", href: "/blog" }],
                footerNav: [],
                children: <p>Hello world</p>,
            } as any
        ).render();

        expect(html).toContain("My Site");
        expect(html).toContain("Blog");
        expect(html).toContain("Hello world");
        expect(html).toContain("© test");
    });

    it("AdminLayout renders the sidebar and the current user", () => {
        const html = view(
            AdminLayout as any,
            { user: { name: "Admin", role: "admin" }, active: "dashboard", children: <p>Dash content</p> } as any
        ).render();

        expect(html).toContain("Admin");
        expect(html).toContain("(admin)");
        expect(html).toContain("Dash content");
        expect(html).toContain('class="active"');
    });
});

// ── SessionAuthGuard ────────────────────────────────────────────────────
describe("SessionAuthGuard", () => {
    function ctxWithSession(store: Record<string, any>): any {
        return {
            request: { session: { get: (key: string) => store[key] } },
            context: { metadata: new Map() },
        };
    }

    it("denies a request with no session userId", () => {
        const guard = new SessionAuthGuard();
        expect(guard.canActivate(ctxWithSession({}))).toBe(false);
    });

    it("allows a request with a session userId, and populates metadata for RolesGuard", () => {
        const guard = new SessionAuthGuard();
        const ctx = ctxWithSession({ userId: "u1", role: "editor" });
        expect(guard.canActivate(ctx)).toBe(true);
        expect(ctx.context.metadata.get("user")).toEqual({ userId: "u1", roles: ["editor"] });
    });
});

// ── Admin CRUD round trip against a fake in-memory repository ──────────
describe("CategoriesController (CRUD against a fake repository, no live DB)", () => {
    function fakeCategoryRepository() {
        const rows: any[] = [];
        return {
            rows,
            findAll: async () => rows,
            findById: async (id: string) => rows.find((r) => r.id === id) ?? null,
            create: async (data: any) => {
                const row = { id: `id-${rows.length + 1}`, ...data };
                rows.push(row);
                return row;
            },
            update: async (id: string, data: any) => {
                const row = rows.find((r) => r.id === id);
                if (row) Object.assign(row, data);
                return row ?? null;
            },
            delete: async (id: string) => {
                const index = rows.findIndex((r) => r.id === id);
                if (index >= 0) rows.splice(index, 1);
                return index >= 0;
            },
        };
    }

    it("creates, lists, updates, and deletes a category end to end", async () => {
        const repo = fakeCategoryRepository();
        const controller = new CategoriesController(repo as any);

        await controller.create({ name: "News", slug: "news" } as any, fakeReply());
        expect(repo.rows).toHaveLength(1);

        const indexView = await controller.index(undefined, {} as any);
        expect((indexView as any).render()).toContain("News");

        await controller.update(repo.rows[0].id, { name: "Updates", slug: "updates" } as any, fakeReply());
        expect(repo.rows[0].name).toBe("Updates");

        await controller.delete(repo.rows[0].id, fakeReply());
        expect(repo.rows).toHaveLength(0);
    });
});

// ── Islands: both bundle via esbuild, and appear correctly in rendered HTML ──
//
// registerIslands() (dynamic `import()` of a runtime-computed path) isn't
// exercised here — that resolution is handled by tsx (dev) / tsc's compiled
// .js extensions (prod), neither of which vitest's own test transform
// replicates for a *computed* import path. defineIsland() (what
// registerIslands() calls per entry) is used directly instead, against the
// real component modules (statically imported, so vitest handles them
// normally) — this still proves island()/view() render real components.
describe("islands", () => {
    let outDir: string;

    beforeAll(async () => {
        outDir = fs.mkdtempSync(path.join(os.tmpdir(), "cms-islands-test-"));
        await buildIslands(islandManifest, { baseDir: path.join(__dirname, "../app/islands"), outDir });
        defineIsland("MenuReorder", MenuReorder);
    });

    afterAll(() => {
        fs.rmSync(outDir, { recursive: true, force: true });
        setIslandFileManifest(null);
    });

    it("bundles both MediaUploader and MenuReorder with a manifest", () => {
        const manifest = JSON.parse(fs.readFileSync(path.join(outDir, "islands-manifest.json"), "utf-8"));
        expect(Object.keys(manifest.islands).sort()).toEqual(["MediaUploader", "MenuReorder"]);
    });

    it("a view using island(\"MenuReorder\", ...) renders the real component's markup plus the hydration marker", () => {
        setIslandFileManifest({ islands: { MenuReorder: "MenuReorder-test.js" }, bootstrap: "_nyala-islands-test.js" });

        function Page() {
            return <div>{island("MenuReorder", { menuId: "m1", items: [{ id: "i1", label: "Home" }] })}</div>;
        }

        const html = view(Page, {}).render();
        expect(html).toContain('data-nyala-island="MenuReorder"');
        expect(html).toContain("Home"); // the real MenuReorder component's own rendered item
        expect(html).toContain("_nyala-islands-test.js");
    });
});

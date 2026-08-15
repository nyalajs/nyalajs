import "reflect-metadata";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Logger } from "@nyalajs/observability";
import { AssetVersionResolver, configureInertia, resetInertiaConfig } from "@nyalajs/inertia";
import { PostsController } from "../../app/controllers/posts.controller";
import { PostsService } from "../../app/services/posts.service";
import { Post } from "../../app/models/post.model";

/** Same in-memory fake as posts.service.spec.ts. */
class FakePostRepository {
    private rows: Post[] = [];
    private nextId = 1;

    async findAllOrdered(): Promise<Post[]> {
        return [...this.rows];
    }
    async findById(id: string): Promise<Post | null> {
        return this.rows.find((r) => r.id === id) ?? null;
    }
    async createPost(data: Omit<Post, "id" | "createdAt" | "updatedAt">): Promise<Post> {
        const now = new Date();
        const row = { id: `post-${this.nextId++}`, createdAt: now, updatedAt: now, ...data } as Post;
        this.rows.push(row);
        return row;
    }
    async update(id: string, data: Partial<Post>): Promise<Post | null> {
        const index = this.rows.findIndex((r) => r.id === id);
        if (index === -1) return null;
        this.rows[index] = { ...this.rows[index], ...data, updatedAt: new Date() };
        return this.rows[index];
    }
    async delete(id: string): Promise<boolean> {
        const index = this.rows.findIndex((r) => r.id === id);
        if (index === -1) return false;
        this.rows.splice(index, 1);
        return true;
    }
}

/** Minimal in-memory session, matching @fastify/secure-session's get/set/delete shape. */
class FakeSession {
    private store = new Map<string, unknown>();
    get(key: string) {
        return this.store.get(key);
    }
    set(key: string, value: unknown) {
        this.store.set(key, value);
    }
    delete() {
        this.store.clear();
    }
}

/**
 * `inertia: true` sets the X-Inertia request header — matching a real
 * navigation made by Inertia's client (see
 * packages/inertia/src/inertia-response.ts's isInertiaRequest()) — so
 * render() returns the JSON page object instead of a full HTML shell.
 * Defaults to true here because these tests care about the page object,
 * not the HTML wrapper; html-shell.spec.ts in @nyalajs/inertia already
 * covers the non-Inertia (hard navigation) HTML path.
 */
function fakeRequest(sessionValues: Record<string, unknown> = {}, options: { inertia?: boolean } = {}) {
    const session = new FakeSession();
    for (const [k, v] of Object.entries(sessionValues)) session.set(k, v);
    const headers: Record<string, string> = {};
    if (options.inertia ?? true) {
        headers["x-inertia"] = "true";
        // Must match AssetVersionResolver({ dev: true }).getVersion()
        // ("dev" — see packages/inertia/src/asset-version.ts) or
        // InertiaResponse treats this as a stale-version request and
        // returns a 409 with an empty body instead of the page object
        // (the real X-Inertia-Version mismatch protocol — see
        // packages/inertia/src/__tests__/inertia-response.spec.ts for the
        // dedicated coverage of that branch).
        headers["x-inertia-version"] = "dev";
    }
    return { headers, url: "/posts", session } as any;
}

function fakeReply() {
    const calls: { status?: number; redirectedTo?: string; headers: Record<string, string> } = { headers: {} };
    return {
        header(name: string, value: string) {
            calls.headers[name] = value;
            return this;
        },
        redirect(status: number, url: string) {
            calls.status = status;
            calls.redirectedTo = url;
            return calls;
        },
        _calls: calls,
    } as any;
}

describe("PostsController", () => {
    let repo: FakePostRepository;
    let service: PostsService;
    let controller: PostsController;

    beforeEach(() => {
        // inertia()/flash() both require configureInertia() to have run —
        // see packages/inertia/src/inertia.ts's requireConfig(). Dev mode
        // (dev: true) avoids needing a real Vite manifest.json on disk.
        configureInertia({
            assets: new AssetVersionResolver({ outDir: "/tmp/does-not-exist", dev: true }),
            html: { entry: "resources/js/app.tsx" },
        });

        repo = new FakePostRepository();
        service = new PostsService(repo as any, new Logger("test"));
        controller = new PostsController(service);
    });

    afterEach(() => {
        resetInertiaConfig();
    });

    describe("index", () => {
        it("returns an InertiaResponse for the Posts/Index component", async () => {
            const req = fakeRequest({ userId: "user-a" });
            const res = fakeReply();

            const response = controller.index(req, res);
            const body = await response.render();
            const page = JSON.parse(body);

            expect(page.component).toBe("Posts/Index");
            expect(page.props.posts).toEqual([]);
        });

        it("renders a full HTML shell with a data-page attribute on a hard navigation (no X-Inertia header)", async () => {
            const req = fakeRequest({ userId: "user-a" }, { inertia: false });
            const res = fakeReply();

            const response = controller.index(req, res);
            expect(response.contentType).toBe("text/html");

            const html = await response.render();
            expect(html).toContain("<!DOCTYPE html>");
            expect(html).toMatch(/data-page="/);

            // The embedded data-page JSON should be the same real Page
            // object an XHR request would get as its raw JSON body.
            const match = html.match(/data-page="([^"]*)"/);
            expect(match).not.toBeNull();
            const decoded = match![1].replace(/&quot;/g, '"');
            const page = JSON.parse(decoded);
            expect(page.component).toBe("Posts/Index");
        });
    });

    describe("create", () => {
        it("creates a post and redirects to the index with a flash message", async () => {
            const req = fakeRequest({ userId: "user-a" });
            const res = fakeReply();

            await controller.create({ title: "Hello", body: "World", published: true }, req, res);

            expect(res._calls.status).toBe(303);
            expect(res._calls.redirectedTo).toBe("/posts");

            const posts = await service.findAll();
            expect(posts).toHaveLength(1);
            expect(posts[0].title).toBe("Hello");
            expect(posts[0].authorId).toBe("user-a");
        });

        it("redirects back to the create form with flashed errors on invalid input", async () => {
            const req = fakeRequest({ userId: "user-a" });
            const res = fakeReply();

            await controller.create({ title: "", body: "" } as any, req, res);

            expect(res._calls.redirectedTo).toBe("/posts/create");
            expect(await service.findAll()).toHaveLength(0);

            // The flashed errors should surface as props.errors on the very
            // next InertiaResponse render — exercise that round trip for real
            // instead of just asserting on the raw session value.
            const nextResponse = controller.createPage(req, fakeReply());
            const page = JSON.parse(await nextResponse.render());
            expect(page.props.errors.title).toBeTruthy();
            expect(page.props.errors.body).toBeTruthy();
        });
    });

    describe("update", () => {
        it("updates an existing post", async () => {
            const req = fakeRequest({ userId: "user-a" });
            await controller.create({ title: "Original", body: "Body", published: false }, req, fakeReply());
            const [seeded] = await service.findAll();

            const res = fakeReply();
            await controller.update(seeded.id, { title: "Updated", body: "New body", published: true }, req, res);

            expect(res._calls.redirectedTo).toBe("/posts");
            const updated = await service.findOne(seeded.id);
            expect(updated?.title).toBe("Updated");
            expect(updated?.published).toBe(true);
        });

        it("flashes an error and redirects to the index when the post doesn't exist", async () => {
            const req = fakeRequest({ userId: "user-a" });
            const res = fakeReply();

            await controller.update("missing", { title: "x", body: "y" }, req, res);

            expect(res._calls.redirectedTo).toBe("/posts");
        });
    });

    describe("destroy", () => {
        it("deletes a post and redirects with a success flash", async () => {
            const req = fakeRequest({ userId: "user-a" });
            await controller.create({ title: "Bye", body: "..." } as any, req, fakeReply());
            const [seeded] = await service.findAll();

            const res = fakeReply();
            await controller.destroy(seeded.id, req, res);

            expect(res._calls.redirectedTo).toBe("/posts");
            expect(await service.findOne(seeded.id)).toBeNull();
        });
    });
});

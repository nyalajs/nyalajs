import "reflect-metadata";
import { describe, it, expect, beforeEach } from "vitest";
import { Logger } from "@nyalajs/observability";
import { PostsService } from "../../app/services/posts.service";
import { Post } from "../../app/models/post.model";

/**
 * In-memory fake of PostRepository — PostsService only depends on the
 * methods below, so this fake stands in for the real Drizzle/SQLite-backed
 * repository without touching a real database file. Same pattern as
 * examples/todo-api/tests/unit/todos.service.spec.ts's FakeTodoRepository.
 */
class FakePostRepository {
    private rows: Post[] = [];
    private nextId = 1;

    seed(post: Partial<Post> & { title: string; authorId: string }): Post {
        const now = new Date();
        const row = {
            id: `post-${this.nextId++}`,
            body: "",
            published: false,
            createdAt: now,
            updatedAt: now,
            ...post,
        } as Post;
        this.rows.push(row);
        return row;
    }

    async findAllOrdered(): Promise<Post[]> {
        return [...this.rows].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
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

describe("PostsService", () => {
    let repo: FakePostRepository;
    let service: PostsService;

    const AUTHOR = "user-a";

    beforeEach(() => {
        repo = new FakePostRepository();
        service = new PostsService(repo as any, new Logger("test"));
    });

    describe("create", () => {
        it("creates a post owned by the given author", async () => {
            const post = await service.create(AUTHOR, { title: "Hello", body: "World" });

            expect(post.title).toBe("Hello");
            expect(post.authorId).toBe(AUTHOR);
            expect(post.published).toBe(false);
        });

        it("defaults published to false when omitted", async () => {
            const post = await service.create(AUTHOR, { title: "Draft", body: "..." });
            expect(post.published).toBe(false);
        });

        it("respects an explicit published: true", async () => {
            const post = await service.create(AUTHOR, { title: "Live", body: "...", published: true });
            expect(post.published).toBe(true);
        });
    });

    describe("findAll", () => {
        it("returns every post, newest first", async () => {
            repo.seed({ title: "Older", authorId: AUTHOR, createdAt: new Date("2026-01-01") });
            repo.seed({ title: "Newer", authorId: AUTHOR, createdAt: new Date("2026-02-01") });

            const posts = await service.findAll();

            expect(posts).toHaveLength(2);
            expect(posts[0].title).toBe("Newer");
        });
    });

    describe("findOne", () => {
        it("returns the post when it exists", async () => {
            const seeded = repo.seed({ title: "Findable", authorId: AUTHOR });

            const found = await service.findOne(seeded.id);
            expect(found?.id).toBe(seeded.id);
        });

        it("returns null when the post doesn't exist", async () => {
            const found = await service.findOne("missing");
            expect(found).toBeNull();
        });
    });

    describe("update", () => {
        it("updates an existing post's fields", async () => {
            const seeded = repo.seed({ title: "Old title", authorId: AUTHOR });

            const updated = await service.update(seeded.id, { title: "New title", body: "New body" });

            expect(updated?.title).toBe("New title");
            expect(updated?.body).toBe("New body");
        });

        it("returns null when updating a post that doesn't exist", async () => {
            const updated = await service.update("missing", { title: "x", body: "y" });
            expect(updated).toBeNull();
        });
    });

    describe("delete", () => {
        it("deletes an existing post", async () => {
            const seeded = repo.seed({ title: "Bye", authorId: AUTHOR });

            const result = await service.delete(seeded.id);

            expect(result).toBe(true);
            expect(await service.findOne(seeded.id)).toBeNull();
        });

        it("returns false when deleting a post that doesn't exist", async () => {
            const result = await service.delete("missing");
            expect(result).toBe(false);
        });
    });
});

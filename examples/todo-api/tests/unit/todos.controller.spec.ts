import "reflect-metadata";
import { describe, it, expect, beforeEach } from "vitest";
import { TodosController } from "../../app/controllers/todos.controller";
import { TodosService } from "../../app/services/todos.service";

/**
 * Fake AuthService — only verifyToken() is exercised by TodosController.
 * Tokens here are plain strings mapped to a "sub" (userId), avoiding any
 * real JWT signing/secret setup for these unit tests.
 */
class FakeAuthService {
    private tokens = new Map<string, { sub: string }>();

    issue(userId: string): string {
        const token = `token-${userId}`;
        this.tokens.set(token, { sub: userId });
        return token;
    }

    verifyToken(token: string) {
        const payload = this.tokens.get(token);
        if (!payload) {
            throw new Error("Invalid token");
        }
        return payload;
    }
}

describe("TodosController", () => {
    const USER_A = "user-a";
    const USER_B = "user-b";

    let auth: FakeAuthService;
    let tokenA: string;
    let tokenB: string;
    let controller: TodosController;
    let created: any;

    beforeEach(async () => {
        auth = new FakeAuthService();
        tokenA = auth.issue(USER_A);
        tokenB = auth.issue(USER_B);

        // TodosService is exercised for real here (backed by the in-memory
        // repository from todos.service.spec.ts's fake would duplicate a lot
        // of setup) — instead we reuse a minimal fake repository inline.
        const repo = new (class {
            private rows: any[] = [];
            private nextId = 1;

            async create(data: any) {
                const row = { id: `todo-${this.nextId++}`, completed: false, ...data };
                this.rows.push(row);
                return row;
            }
            async findAllForUser(userId: string) {
                return this.rows.filter((r) => r.userId === userId);
            }
            async countForUser(userId: string) {
                return this.rows.filter((r) => r.userId === userId).length;
            }
            async findByIdForUser(id: string, userId: string) {
                return this.rows.find((r) => r.id === id && r.userId === userId) ?? null;
            }
            async updateForUser(id: string, userId: string, data: any) {
                const row = this.rows.find((r) => r.id === id && r.userId === userId);
                if (!row) return null;
                Object.assign(row, data);
                return row;
            }
            async deleteForUser(id: string, userId: string) {
                const index = this.rows.findIndex((r) => r.id === id && r.userId === userId);
                if (index === -1) return false;
                this.rows.splice(index, 1);
                return true;
            }
        })();

        const { Logger } = await import("@nyalajs/observability");
        const service = new TodosService(repo as any, new Logger("test"));
        controller = new TodosController(service, auth as any);

        created = await controller.create(`Bearer ${tokenA}`, { title: "Write tests" } as any);
    });

    it("creates a todo for the authenticated user", () => {
        expect(created.statusCode).toBe(201);
        expect(created.data.userId).toBe(USER_A);
    });

    it("rejects requests with no Authorization header", async () => {
        const result = await controller.index(undefined as any, 1, 10);
        expect(result.statusCode).toBe(401);
    });

    it("rejects requests with a malformed Authorization header", async () => {
        const result = await controller.show("NotBearer abc", "todo-1");
        expect(result.statusCode).toBe(401);
    });

    it("rejects requests with an invalid token", async () => {
        const result = await controller.index("Bearer garbage-token", 1, 10);
        expect(result.statusCode).toBe(401);
    });

    it("lists only the caller's own todos", async () => {
        await controller.create(`Bearer ${tokenB}`, { title: "Someone else's" } as any);

        const result = await controller.index(`Bearer ${tokenA}`, 1, 10);

        expect(result.data).toHaveLength(1);
        expect(result.data[0].userId).toBe(USER_A);
    });

    it("returns 404 when a user tries to read another user's todo", async () => {
        const result = await controller.show(`Bearer ${tokenB}`, created.data.id);
        expect(result.statusCode).toBe(404);
    });

    it("allows the owner to read their own todo", async () => {
        const result = await controller.show(`Bearer ${tokenA}`, created.data.id);
        expect(result.statusCode).toBe(200);
        expect(result.data.id).toBe(created.data.id);
    });

    it("returns 404 when a user tries to update another user's todo", async () => {
        const result = await controller.update(`Bearer ${tokenB}`, created.data.id, { title: "Hijacked" } as any);
        expect(result.statusCode).toBe(404);
    });

    it("allows the owner to update their own todo", async () => {
        const result = await controller.update(`Bearer ${tokenA}`, created.data.id, { title: "Updated" } as any);
        expect(result.statusCode).toBe(200);
        expect(result.data.title).toBe("Updated");
    });

    it("marks the caller's own todo as complete", async () => {
        const result = await controller.complete(`Bearer ${tokenA}`, created.data.id, { completed: true });
        expect(result.statusCode).toBe(200);
        expect(result.data.completed).toBe(true);
    });

    it("returns 404 completing another user's todo", async () => {
        const result = await controller.complete(`Bearer ${tokenB}`, created.data.id, { completed: true });
        expect(result.statusCode).toBe(404);
    });

    it("returns 404 when a user tries to delete another user's todo", async () => {
        const result = await controller.destroy(`Bearer ${tokenB}`, created.data.id);
        expect(result.statusCode).toBe(404);
    });

    it("allows the owner to delete their own todo", async () => {
        const result = await controller.destroy(`Bearer ${tokenA}`, created.data.id);
        expect(result.statusCode).toBe(200);

        const after = await controller.show(`Bearer ${tokenA}`, created.data.id);
        expect(after.statusCode).toBe(404);
    });
});

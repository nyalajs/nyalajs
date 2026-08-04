import "reflect-metadata";
import { describe, it, expect, beforeEach } from "vitest";
import { Logger } from "@nyalajs/observability";
import { TodosService } from "../../app/services/todos.service";
import { Todo } from "../../app/models/todo.model";

/**
 * In-memory fake of TodoRepository. TodosService only depends on the
 * public methods below, so this fake stands in for the real Drizzle-backed
 * repository without needing a live Postgres connection.
 */
class FakeTodoRepository {
    private rows: Todo[] = [];
    private nextId = 1;

    seed(todo: Partial<Todo> & { userId: string; title: string }) {
        const row = {
            id: `todo-${this.nextId++}`,
            description: null,
            completed: false,
            dueDate: null,
            createdAt: new Date(),
            updatedAt: new Date(),
            ...todo,
        } as Todo;
        this.rows.push(row);
        return row;
    }

    async findAllForUser(userId: string, options?: { limit?: number; offset?: number }) {
        const owned = this.rows.filter((r) => r.userId === userId);
        const offset = options?.offset ?? 0;
        const limit = options?.limit ?? owned.length;
        return owned.slice(offset, offset + limit);
    }

    async findByIdForUser(id: string, userId: string) {
        return this.rows.find((r) => r.id === id && r.userId === userId) ?? null;
    }

    async countForUser(userId: string) {
        return this.rows.filter((r) => r.userId === userId).length;
    }

    async create(data: Partial<Todo>) {
        const row = {
            id: `todo-${this.nextId++}`,
            description: null,
            completed: false,
            dueDate: null,
            createdAt: new Date(),
            updatedAt: new Date(),
            ...data,
        } as Todo;
        this.rows.push(row);
        return row;
    }

    async updateForUser(id: string, userId: string, data: Partial<Todo>) {
        const index = this.rows.findIndex((r) => r.id === id && r.userId === userId);
        if (index === -1) return null;
        this.rows[index] = { ...this.rows[index], ...data, updatedAt: new Date() };
        return this.rows[index];
    }

    async deleteForUser(id: string, userId: string) {
        const index = this.rows.findIndex((r) => r.id === id && r.userId === userId);
        if (index === -1) return false;
        this.rows.splice(index, 1);
        return true;
    }
}

describe("TodosService", () => {
    let repo: FakeTodoRepository;
    let service: TodosService;

    const USER_A = "user-a";
    const USER_B = "user-b";

    beforeEach(() => {
        repo = new FakeTodoRepository();
        service = new TodosService(repo as any, new Logger("test"));
    });

    describe("create", () => {
        it("creates a todo owned by the given user", async () => {
            const todo = await service.create(USER_A, { title: "Buy milk" });

            expect(todo.title).toBe("Buy milk");
            expect(todo.userId).toBe(USER_A);
            expect(todo.completed).toBe(false);
        });

        it("converts a dueDate string into a Date", async () => {
            const todo = await service.create(USER_A, {
                title: "Ship release",
                dueDate: "2026-09-01T00:00:00.000Z",
            });

            expect(todo.dueDate).toBeInstanceOf(Date);
        });
    });

    describe("findAll — list only own todos", () => {
        beforeEach(() => {
            repo.seed({ userId: USER_A, title: "A1" });
            repo.seed({ userId: USER_A, title: "A2" });
            repo.seed({ userId: USER_B, title: "B1" });
        });

        it("only returns todos belonging to the requesting user", async () => {
            const { data, pagination } = await service.findAll(USER_A, 1, 10);

            expect(data).toHaveLength(2);
            expect(data.every((t) => t.userId === USER_A)).toBe(true);
            expect(pagination.total).toBe(2);
        });

        it("does not leak another user's todos into the count", async () => {
            const { pagination } = await service.findAll(USER_B, 1, 10);
            expect(pagination.total).toBe(1);
        });

        it("paginates results", async () => {
            const { data, pagination } = await service.findAll(USER_A, 1, 1);

            expect(data).toHaveLength(1);
            expect(pagination.totalPages).toBe(2);
        });
    });

    describe("findOne — cross-user access", () => {
        it("returns the todo when the caller owns it", async () => {
            const seeded = repo.seed({ userId: USER_A, title: "Mine" });

            const found = await service.findOne(seeded.id, USER_A);
            expect(found?.id).toBe(seeded.id);
        });

        it("returns null when the todo belongs to a different user", async () => {
            const seeded = repo.seed({ userId: USER_A, title: "Not yours" });

            const found = await service.findOne(seeded.id, USER_B);
            expect(found).toBeNull();
        });
    });

    describe("update", () => {
        it("updates a todo owned by the caller", async () => {
            const seeded = repo.seed({ userId: USER_A, title: "Old title" });

            const updated = await service.update(seeded.id, USER_A, { title: "New title" });

            expect(updated?.title).toBe("New title");
        });

        it("refuses to update another user's todo", async () => {
            const seeded = repo.seed({ userId: USER_A, title: "Protected" });

            const updated = await service.update(seeded.id, USER_B, { title: "Hijacked" });

            expect(updated).toBeNull();
        });
    });

    describe("setCompleted", () => {
        it("marks a todo as complete", async () => {
            const seeded = repo.seed({ userId: USER_A, title: "Task", completed: false });

            const updated = await service.setCompleted(seeded.id, USER_A, true);

            expect(updated?.completed).toBe(true);
        });

        it("toggles a todo back to incomplete", async () => {
            const seeded = repo.seed({ userId: USER_A, title: "Task", completed: true });

            const updated = await service.setCompleted(seeded.id, USER_A, false);

            expect(updated?.completed).toBe(false);
        });

        it("refuses to complete another user's todo", async () => {
            const seeded = repo.seed({ userId: USER_A, title: "Task" });

            const updated = await service.setCompleted(seeded.id, USER_B, true);

            expect(updated).toBeNull();
        });
    });

    describe("delete", () => {
        it("deletes a todo owned by the caller", async () => {
            const seeded = repo.seed({ userId: USER_A, title: "Bye" });

            const result = await service.delete(seeded.id, USER_A);

            expect(result).toBe(true);
            expect(await service.findOne(seeded.id, USER_A)).toBeNull();
        });

        it("refuses to delete another user's todo", async () => {
            const seeded = repo.seed({ userId: USER_A, title: "Safe" });

            const result = await service.delete(seeded.id, USER_B);

            expect(result).toBe(false);
            expect(await service.findOne(seeded.id, USER_A)).not.toBeNull();
        });
    });
});

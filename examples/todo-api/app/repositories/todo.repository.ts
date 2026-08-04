import { Injectable } from "@nyalajs/core";
import { and, eq } from "drizzle-orm";
import { BaseRepository } from "./base.repository";
import { db } from "../../database/connection";
import { todos, Todo } from "../models/todo.model";

/**
 * Todo Repository
 *
 * Handles all database operations related to todos.
 * Extends BaseRepository for common CRUD operations.
 *
 * All lookups here are scoped to a specific userId so callers can never
 * read or mutate another user's todos through this repository.
 */
@Injectable()
export class TodoRepository extends BaseRepository<Todo> {
    constructor() {
        super(todos);
    }

    /**
     * Find all todos owned by a user, with pagination
     */
    async findAllForUser(
        userId: string,
        options?: { limit?: number; offset?: number }
    ): Promise<Todo[]> {
        return this.findAll({
            ...options,
            where: eq(todos.userId, userId),
        });
    }

    /**
     * Find a single todo by ID, scoped to its owner
     */
    async findByIdForUser(id: string, userId: string): Promise<Todo | null> {
        return this.findOne(and(eq(todos.id, id), eq(todos.userId, userId))!);
    }

    /**
     * Count todos owned by a user
     */
    async countForUser(userId: string): Promise<number> {
        return this.count(eq(todos.userId, userId));
    }

    /**
     * Update a todo, scoped to its owner. Returns null if the todo
     * doesn't exist or isn't owned by the given user.
     */
    async updateForUser(id: string, userId: string, data: Partial<Todo>): Promise<Todo | null> {
        const results = await db
            .update(todos)
            .set({ ...data, updatedAt: new Date() } as any)
            .where(and(eq(todos.id, id), eq(todos.userId, userId)))
            .returning();

        return (results[0] as Todo) || null;
    }

    /**
     * Delete a todo, scoped to its owner
     */
    async deleteForUser(id: string, userId: string): Promise<boolean> {
        const result = await db
            .delete(todos)
            .where(and(eq(todos.id, id), eq(todos.userId, userId)))
            .returning();

        return result.length > 0;
    }
}

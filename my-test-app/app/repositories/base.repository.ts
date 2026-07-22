import { Injectable } from "@nyalajs/core";
import { eq, and, SQL } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";
import { db } from "../../database/connection";

/**
 * Base Repository
 *
 * Provides common database operations for all repositories.
 * Extend this class to create model-specific repositories.
 *
 * @example
 * export class UserRepository extends BaseRepository<User> {
 *     constructor() {
 *         super(users);
 *     }
 * }
 */
@Injectable()
export abstract class BaseRepository<T> {
    constructor(protected readonly table: PgTable) { }

    /**
     * Find all records
     */
    async findAll(options?: {
        limit?: number;
        offset?: number;
        where?: SQL;
    }): Promise<T[]> {
        let query = db.select().from(this.table);

        if (options?.where) {
            query = query.where(options.where) as any;
        }

        if (options?.limit) {
            query = query.limit(options.limit) as any;
        }

        if (options?.offset) {
            query = query.offset(options.offset) as any;
        }

        return query as Promise<T[]>;
    }

    /**
     * Find record by ID
     */
    async findById(id: string): Promise<T | null> {
        const results = await db
            .select()
            .from(this.table)
            .where(eq((this.table as any).id, id))
            .limit(1);

        return (results[0] as T) || null;
    }

    /**
     * Find one record matching conditions
     */
    async findOne(where: SQL): Promise<T | null> {
        const results = await db
            .select()
            .from(this.table)
            .where(where)
            .limit(1);

        return (results[0] as T) || null;
    }

    /**
     * Create a new record
     */
    async create(data: Partial<T>): Promise<T> {
        const results = await db
            .insert(this.table)
            .values(data as any)
            .returning();

        return results[0] as T;
    }

    /**
     * Update record by ID
     */
    async update(id: string, data: Partial<T>): Promise<T | null> {
        const results = await db
            .update(this.table)
            .set({ ...data, updatedAt: new Date() } as any)
            .where(eq((this.table as any).id, id))
            .returning();

        return (results[0] as T) || null;
    }

    /**
     * Delete record by ID
     */
    async delete(id: string): Promise<boolean> {
        const result = await db
            .delete(this.table)
            .where(eq((this.table as any).id, id))
            .returning();

        return result.length > 0;
    }

    /**
     * Count records
     */
    async count(where?: SQL): Promise<number> {
        let query = db.select().from(this.table);

        if (where) {
            query = query.where(where) as any;
        }

        const results = await query;
        return results.length;
    }

    /**
     * Check if record exists
     */
    async exists(where: SQL): Promise<boolean> {
        const count = await this.count(where);
        return count > 0;
    }
}

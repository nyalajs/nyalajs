import { Injectable } from "@nyalajs/core";
import { eq, SQL } from "drizzle-orm";
import { MySqlTable } from "drizzle-orm/mysql-core";
import { db } from "../../database/connection";

/**
 * Base Repository (MySQL variant)
 *
 * Same shape as templates/inertia-starter's SQLite BaseRepository<T>, but
 * MySQL's INSERT/UPDATE/DELETE don't support a RETURNING clause at all
 * (unlike Postgres/SQLite, which is what that starter's version relies
 * on) — every write here re-SELECTs the affected row by id afterward
 * instead. Callers must always include an `id` in the data passed to
 * create() (this app's repositories generate a real UUID client-side —
 * see DocRepository.createDoc() — since there's no RETURNING to read an
 * auto-generated id back from).
 *
 * Extend this class to create model-specific repositories.
 *
 * @example
 * export class DocRepository extends BaseRepository<Doc> {
 *     constructor() {
 *         super(docs);
 *     }
 * }
 */
@Injectable()
export abstract class BaseRepository<T> {
    constructor(protected readonly table: MySqlTable) {}

    /**
     * Find all records
     */
    async findAll(options?: { limit?: number; offset?: number; where?: SQL }): Promise<T[]> {
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
        const results = await db.select().from(this.table).where(where).limit(1);

        return (results[0] as T) || null;
    }

    /**
     * Create a new record — `data` must include `id`, since MySQL has no
     * RETURNING to read a server-generated one back from.
     */
    async create(data: Partial<T> & { id: string }): Promise<T> {
        await db.insert(this.table).values(data as any);
        return (await this.findById(data.id)) as T;
    }

    /**
     * Update record by ID
     */
    async update(id: string, data: Partial<T>): Promise<T | null> {
        await db
            .update(this.table)
            .set({ ...data, updatedAt: new Date() } as any)
            .where(eq((this.table as any).id, id));

        return this.findById(id);
    }

    /**
     * Delete record by ID
     */
    async delete(id: string): Promise<boolean> {
        const [result] = await db.delete(this.table).where(eq((this.table as any).id, id));
        return (result as any).affectedRows > 0;
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

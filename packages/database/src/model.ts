import { SchemaRegistry } from "./schema/registry";
import { NodePgDatabase } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";

export abstract class Model {
    /** 
     * The database instance. In a real framework, this would be injected or
     * set globally. For the Active Record pattern, we'll assume it's set globally.
     */
    static db: NodePgDatabase;

    static setDatabase(db: NodePgDatabase) {
        Model.db = db;
    }

    /**
     * Find all records.
     */
    static async all<T extends Model>(this: new () => T): Promise<T[]> {
        const table = SchemaRegistry.getTable(this);
        const results = await (this as any).db.select().from(table);
        return results.map((row: any) => Object.assign(new this(), row));
    }

    /**
     * Find a record by its primary key.
     */
    static async find<T extends Model>(this: new () => T, id: string | number): Promise<T | null> {
        const table = SchemaRegistry.getTable(this);
        // Assuming "id" is the primary key column for simplicity in this V1 implementation.
        // A robust version would introspect the @Primary metadata.
        const results = await (this as any).db.select().from(table).where(eq(table.id, id)).limit(1);
        if (results.length === 0) return null;
        return Object.assign(new this(), results[0]);
    }

    /**
     * Create a new record.
     */
    static async create<T extends Model>(this: new () => T, data: Partial<T>): Promise<T> {
        const table = SchemaRegistry.getTable(this);
        const results = await (this as any).db.insert(table).values(data).returning();
        return Object.assign(new this(), results[0]);
    }

    /**
     * Save the current instance (insert or update).
     */
    async save(): Promise<this> {
        const constructor = this.constructor as typeof Model;
        const table = SchemaRegistry.getTable(constructor);
        
        const data = { ...this };
        
        if ((this as any).id) {
            // Update
            await constructor.db.update(table)
                .set(data)
                .where(eq(table.id, (this as any).id));
        } else {
            // Insert
            const results = await constructor.db.insert(table).values(data).returning();
            Object.assign(this, results[0]);
        }
        return this;
    }

    /**
     * Delete the current instance.
     */
    async delete(): Promise<void> {
        const constructor = this.constructor as typeof Model;
        const table = SchemaRegistry.getTable(constructor);
        
        if ((this as any).id) {
            await constructor.db.delete(table).where(eq(table.id, (this as any).id));
        }
    }
}

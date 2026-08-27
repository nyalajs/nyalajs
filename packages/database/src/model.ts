import { SchemaRegistry } from "./schema/registry";
import { TenantScope } from "./tenancy/tenant-scope";
import { TransactionContext } from "./transaction-context";
import { ConnectionContext } from "./connection-context";
import { AnyDatabase } from "./dialect";
import { and, eq, SQL } from "drizzle-orm";
import { TenantContext } from "@nyalajs/core";
import { QueryBuilder } from "./relations/query-builder";
import { RelationLoader } from "./relations/relation-loader";

export abstract class Model {
    /**
     * The database instance. In a real framework, this would be injected or
     * set globally. For the Active Record pattern, we'll assume it's set globally.
     */
    static db: AnyDatabase;

    static setDatabase(db: AnyDatabase) {
        Model.db = db;
    }

    /**
     * The connection to run queries against, in priority order:
     *   1. The active transaction, if one is open (DatabaseService.transaction()) —
     *      a transaction must never be silently re-targeted mid-flight.
     *   2. The active dedicated-tenant connection, if one is set (populated by
     *      @nyalajs/tenancy's TenantMiddleware via ConnectionContext, for
     *      tenants whose isolationMode is "dedicated").
     *   3. The global shared pool (modelClass.db) — unchanged default
     *      behavior for shared-DB tenants and every non-multi-tenant app.
     */
    private static connection(modelClass: any): any {
        return TransactionContext.get() ?? ConnectionContext.get() ?? modelClass.db;
    }

    /**
     * Returns the tenant WHERE condition for `modelClass`, or `undefined` if
     * its table isn't tenant-scoped. Throws if the table IS tenant-scoped but
     * no tenant is active — scoping is mandatory, not opt-in, for any model
     * with a `tenant_id` column.
     */
    private static requireTenantScope(modelClass: any): SQL | undefined {
        const table = SchemaRegistry.getTable(modelClass);
        if (!table.tenantId) return undefined;

        const tenantId = TenantContext.get();
        if (!tenantId) {
            throw new Error(
                `Tenant context required: ${modelClass.name}'s table has a tenant_id column ` +
                `but no tenant is active for the current request/transaction.`
            );
        }

        return TenantScope.getScope(modelClass, tenantId);
    }

    /**
     * Stamps `tenant_id` onto insert payloads for tenant-scoped tables
     * (unless already set), and throws if the table is tenant-scoped but no
     * tenant is active — same fail-closed policy as reads.
     */
    private static stampTenant(modelClass: any, data: any): any {
        const table = SchemaRegistry.getTable(modelClass);
        if (!table.tenantId || (data as any).tenantId) return data;

        const tenantId = TenantContext.get();
        if (!tenantId) {
            throw new Error(
                `Tenant context required: ${modelClass.name}'s table has a tenant_id column ` +
                `but no tenant is active for the current request/transaction.`
            );
        }

        return { ...data, tenantId };
    }

    /**
     * Inserts `data` and returns the persisted row. Postgres and SQLite both
     * support `.returning()`, so a single INSERT does the job. MySQL has no
     * RETURNING clause: if the caller supplied the primary key (the common
     * case here, since this framework doesn't auto-generate ids), a single
     * INSERT followed by a SELECT-by-id gets the same result; otherwise the
     * driver-assigned id is read back via `$returningId()` first.
     */
    private static async insertAndReturn(modelClass: any, table: any, data: any): Promise<any> {
        const conn = Model.connection(modelClass);

        if (SchemaRegistry.getDialect() !== "mysql") {
            const results = await conn.insert(table).values(data).returning();
            return results[0];
        }

        const primaryKey = SchemaRegistry.getPrimaryKey(modelClass);
        if (!primaryKey) {
            await conn.insert(table).values(data);
            return data;
        }

        let idValue = data[primaryKey];
        if (idValue !== undefined) {
            await conn.insert(table).values(data);
        } else {
            const [inserted] = await conn.insert(table).values(data).$returningId();
            idValue = inserted?.[primaryKey];
            if (idValue === undefined) return data;
        }

        const [row] = await conn.select().from(table).where(eq(table[primaryKey], idValue)).limit(1);
        return row ?? data;
    }

    /**
     * A fluent QueryBuilder for this model — `.where()`, `.orderBy()`,
     * `.limit()`/`.offset()`, `.with()` for eager-loading @HasMany/@HasOne/
     * @BelongsTo/@BelongsToMany relations, `.get()`/`.first()` to run it.
     *
     * @example
     *   const users = await User.query().where("active", true).with("posts").get();
     */
    static query<T extends Model>(this: new () => T): QueryBuilder<new () => T> {
        return new QueryBuilder(this);
    }

    /**
     * Find all records. Pass `{ with: [...] }` to eager-load relations —
     * equivalent to `Model.query().with(...).get()`, kept as a shorthand
     * since it's the most common case and reads slightly lighter without
     * the builder for a plain "give me everything, plus these relations".
     */
    static async all<T extends Model>(this: new () => T, options?: { with?: string[] }): Promise<T[]> {
        const table = SchemaRegistry.getTable(this);
        const scope = Model.requireTenantScope(this);
        let query = Model.connection(this).select().from(table);
        if (scope) query = query.where(scope);
        const results = await query;
        const instances = results.map((row: any) => Object.assign(new this(), row));

        if (options?.with?.length) {
            await Model.eagerLoad(this, instances, options.with);
        }

        return instances;
    }

    /**
     * Find a record by its primary key. Pass `{ with: [...] }` to eager-load relations.
     */
    static async find<T extends Model>(
        this: new () => T,
        id: string | number,
        options?: { with?: string[] }
    ): Promise<T | null> {
        const table = SchemaRegistry.getTable(this);
        // Assuming "id" is the primary key column for simplicity in this V1 implementation.
        // A robust version would introspect the @Primary metadata.
        const scope = Model.requireTenantScope(this);
        const where = scope ? and(eq(table.id, id), scope) : eq(table.id, id);
        const results = await Model.connection(this).select().from(table).where(where).limit(1);
        if (results.length === 0) return null;

        const instance = Object.assign(new this(), results[0]);
        if (options?.with?.length) {
            await Model.eagerLoad(this, [instance], options.with);
        }
        return instance;
    }

    private static async eagerLoad(modelClass: any, instances: any[], relations: string[]): Promise<void> {
        const loader = new RelationLoader(Model.connection(modelClass));
        for (const relationName of relations) {
            await loader.load(modelClass, instances, relationName);
        }
    }

    /**
     * Lazily loads one relation onto this instance and returns the loaded
     * value — for the case where a relation wasn't eager-loaded up front
     * (e.g. it's only needed conditionally, deep in some branch of logic).
     *
     * @example
     *   const user = await User.find(id);
     *   const posts = await user.load("posts"); // queries now, not at find() time
     */
    async load<K = any>(relationName: string): Promise<K> {
        const constructor = this.constructor as typeof Model;
        const loader = new RelationLoader(Model.connection(constructor));
        await loader.load(constructor, [this], relationName);
        return (this as any)[relationName];
    }

    /**
     * Create a new record.
     */
    static async create<T extends Model>(this: new () => T, data: Partial<T>): Promise<T> {
        const table = SchemaRegistry.getTable(this);
        const payload = Model.stampTenant(this, data);
        const row = await Model.insertAndReturn(this, table, payload);
        return Object.assign(new this(), row);
    }

    /**
     * Save the current instance (insert or update).
     */
    async save(): Promise<this> {
        const constructor = this.constructor as typeof Model;
        const table = SchemaRegistry.getTable(constructor);

        if ((this as any).id) {
            // Update
            const scope = Model.requireTenantScope(constructor);
            const data = { ...this };
            const where = scope ? and(eq(table.id, (this as any).id), scope) : eq(table.id, (this as any).id);
            await Model.connection(constructor).update(table)
                .set(data)
                .where(where);
        } else {
            // Insert
            const data = Model.stampTenant(constructor, { ...this });
            const row = await Model.insertAndReturn(constructor, table, data);
            Object.assign(this, row);
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
            const scope = Model.requireTenantScope(constructor);
            const where = scope ? and(eq(table.id, (this as any).id), scope) : eq(table.id, (this as any).id);
            await Model.connection(constructor).delete(table).where(where);
        }
    }
}

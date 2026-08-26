import { and, asc, desc, eq, gt, gte, ilike, inArray, isNotNull, isNull, like, lt, lte, ne, notInArray, SQL } from "drizzle-orm";
import { TenantContext } from "@nyalajs/core";
import { SchemaRegistry } from "../schema/registry";
import { TenantScope } from "../tenancy/tenant-scope";
import { TransactionContext } from "../transaction-context";
import { RelationLoader } from "./relation-loader";

type WhereOperator = "=" | "!=" | ">" | ">=" | "<" | "<=" | "like" | "ilike" | "in" | "notIn" | "isNull" | "isNotNull";

interface WhereClause {
    column: string;
    operator: WhereOperator;
    value?: any;
}

interface OrderClause {
    column: string;
    direction: "asc" | "desc";
}

function buildCondition(table: any, clause: WhereClause): SQL {
    const col = table[clause.column];
    if (!col) {
        throw new Error(`Unknown column "${clause.column}" on table "${table[Symbol.for("drizzle:Name")] ?? "?"}"`);
    }

    switch (clause.operator) {
        case "=": return eq(col, clause.value);
        case "!=": return ne(col, clause.value);
        case ">": return gt(col, clause.value);
        case ">=": return gte(col, clause.value);
        case "<": return lt(col, clause.value);
        case "<=": return lte(col, clause.value);
        case "like": return like(col, clause.value);
        case "ilike": return ilike(col, clause.value);
        case "in": return inArray(col, clause.value);
        case "notIn": return notInArray(col, clause.value);
        case "isNull": return isNull(col);
        case "isNotNull": return isNotNull(col);
    }
}

/**
 * Fluent query builder for one Model class — `Model.query()` returns one of
 * these. Translates directly to Drizzle calls (no separate SQL-generation
 * layer of its own); eager-loaded relations (`.with()`) run as additional,
 * batched queries via RelationLoader after the main query resolves — never
 * one query per row.
 *
 * @example
 *   const users = await User.query()
 *     .where("active", true)
 *     .with("posts", "profile")
 *     .orderBy("createdAt", "desc")
 *     .limit(10)
 *     .get();
 */
export class QueryBuilder<T extends { new (): any }> {
    private wheres: WhereClause[] = [];
    private orders: OrderClause[] = [];
    private withRelations: string[] = [];
    private limitValue?: number;
    private offsetValue?: number;

    constructor(private readonly modelClass: T) {}

    where(column: string, value: any): this;
    where(column: string, operator: WhereOperator, value?: any): this;
    where(column: string, operatorOrValue: WhereOperator | any, value?: any): this {
        if (value === undefined && !["isNull", "isNotNull"].includes(operatorOrValue)) {
            this.wheres.push({ column, operator: "=", value: operatorOrValue });
        } else {
            this.wheres.push({ column, operator: operatorOrValue, value });
        }
        return this;
    }

    whereIn(column: string, values: any[]): this {
        this.wheres.push({ column, operator: "in", value: values });
        return this;
    }

    whereNull(column: string): this {
        this.wheres.push({ column, operator: "isNull" });
        return this;
    }

    whereNotNull(column: string): this {
        this.wheres.push({ column, operator: "isNotNull" });
        return this;
    }

    orderBy(column: string, direction: "asc" | "desc" = "asc"): this {
        this.orders.push({ column, direction });
        return this;
    }

    limit(n: number): this {
        this.limitValue = n;
        return this;
    }

    offset(n: number): this {
        this.offsetValue = n;
        return this;
    }

    /** Eager-load one or more relations declared with @HasMany/@HasOne/@BelongsTo/@BelongsToMany. */
    with(...relations: string[]): this {
        this.withRelations.push(...relations);
        return this;
    }

    /** Runs the query and returns every matching row. */
    async get(): Promise<InstanceType<T>[]> {
        const table = SchemaRegistry.getTable(this.modelClass);
        const connection = this.connection();

        const conditions = [...this.wheres.map((w) => buildCondition(table, w))];
        const tenantScope = this.tenantScope();
        if (tenantScope) conditions.push(tenantScope);

        let query: any = connection.select().from(table);
        if (conditions.length > 0) {
            query = query.where(conditions.length === 1 ? conditions[0] : and(...conditions));
        }
        if (this.orders.length > 0) {
            query = query.orderBy(...this.orders.map((o) => (o.direction === "asc" ? asc(table[o.column]) : desc(table[o.column]))));
        }
        if (this.limitValue !== undefined) query = query.limit(this.limitValue);
        if (this.offsetValue !== undefined) query = query.offset(this.offsetValue);

        const rows = await query;
        const instances = rows.map((row: any) => Object.assign(new (this.modelClass as any)(), row));

        if (this.withRelations.length > 0) {
            const loader = new RelationLoader(connection);
            for (const relationName of this.withRelations) {
                await loader.load(this.modelClass, instances, relationName);
            }
        }

        return instances;
    }

    /** Runs the query with an implicit limit(1) and returns the first match, or null. */
    async first(): Promise<InstanceType<T> | null> {
        this.limit(1);
        const results = await this.get();
        return results[0] ?? null;
    }

    private connection(): any {
        // Mirrors Model's own private connection() — the active transaction
        // if one is open, otherwise the global pool. Duplicated rather than
        // reused directly since Model's version is private; both read the
        // same TransactionContext/`.db` static, so they can't drift.
        return TransactionContext.get() ?? (this.modelClass as any).db;
    }

    private tenantScope(): SQL | undefined {
        const table = SchemaRegistry.getTable(this.modelClass);
        if (!table.tenantId) return undefined;

        const tenantId = TenantContext.get();
        if (!tenantId) {
            throw new Error(
                `Tenant context required: ${(this.modelClass as any).name}'s table has a tenant_id column ` +
                    `but no tenant is active for the current request/transaction.`
            );
        }
        return TenantScope.getScope(this.modelClass, tenantId);
    }
}

import { and, inArray, sql, SQL } from "drizzle-orm";
import { TenantContext } from "@nyalajs/core";
import { SchemaRegistry } from "../schema/registry";
import { TenantScope } from "../tenancy/tenant-scope";
import { RelationDefinition, getRelation } from "./decorators";

/**
 * Executes eager-loading for one relation across a whole batch of parent
 * rows in a single extra query (or two, for belongsToMany's pivot join) —
 * never one query per parent row. `parents` are plain Model instances
 * already resolved from the main query; this attaches the loaded related
 * data directly onto each one under `relation.property`.
 */
export class RelationLoader {
    constructor(private readonly connection: any) {}

    async load(parentModelClass: any, parents: any[], relationName: string): Promise<void> {
        if (parents.length === 0) return;

        const relation = getRelation(parentModelClass, relationName);
        if (!relation) {
            throw new Error(
                `${parentModelClass.name} has no relation "${relationName}" — declare it with @HasMany/@HasOne/@BelongsTo/@BelongsToMany.`
            );
        }

        switch (relation.kind) {
            case "hasMany":
                return this.loadHasMany(parentModelClass, parents, relation, false);
            case "hasOne":
                return this.loadHasMany(parentModelClass, parents, relation, true);
            case "belongsTo":
                return this.loadBelongsTo(parentModelClass, parents, relation);
            case "belongsToMany":
                return this.loadBelongsToMany(parentModelClass, parents, relation);
        }
    }

    /** hasMany/hasOne: FK lives on the related table, pointing back at the parent's local key. */
    private async loadHasMany(
        parentModelClass: any,
        parents: any[],
        relation: RelationDefinition,
        single: boolean
    ): Promise<void> {
        const RelatedModel = relation.related();
        const relatedTable = SchemaRegistry.getTable(RelatedModel);
        const localKey = relation.localKey ?? SchemaRegistry.getPrimaryKey(parentModelClass) ?? "id";

        const localValues = [...new Set(parents.map((p) => p[localKey]).filter((v) => v !== undefined))];
        if (localValues.length === 0) {
            for (const parent of parents) parent[relation.property] = single ? null : [];
            return;
        }

        const fkCondition = inArray(relatedTable[relation.foreignKey], localValues);
        const scope = this.tenantScope(RelatedModel);
        const rows = await this.connection
            .select()
            .from(relatedTable)
            .where(scope ? and(fkCondition, scope) : fkCondition);

        const relatedInstances = rows.map((row: any) => Object.assign(new RelatedModel(), row));

        const byForeignKey = new Map<any, any[]>();
        for (const instance of relatedInstances) {
            const key = instance[relation.foreignKey];
            const bucket = byForeignKey.get(key);
            if (bucket) bucket.push(instance);
            else byForeignKey.set(key, [instance]);
        }

        for (const parent of parents) {
            const matches = byForeignKey.get(parent[localKey]) ?? [];
            parent[relation.property] = single ? (matches[0] ?? null) : matches;
        }
    }

    /** belongsTo: FK lives on the parent table, pointing at the related model's local key. */
    private async loadBelongsTo(parentModelClass: any, parents: any[], relation: RelationDefinition): Promise<void> {
        const RelatedModel = relation.related();
        const relatedTable = SchemaRegistry.getTable(RelatedModel);
        const localKey = relation.localKey ?? SchemaRegistry.getPrimaryKey(RelatedModel) ?? "id";

        const foreignValues = [
            ...new Set(parents.map((p) => p[relation.foreignKey]).filter((v) => v !== undefined && v !== null)),
        ];
        if (foreignValues.length === 0) {
            for (const parent of parents) parent[relation.property] = null;
            return;
        }

        const fkCondition = inArray(relatedTable[localKey], foreignValues);
        const scope = this.tenantScope(RelatedModel);
        const rows = await this.connection
            .select()
            .from(relatedTable)
            .where(scope ? and(fkCondition, scope) : fkCondition);

        const relatedInstances = rows.map((row: any) => Object.assign(new RelatedModel(), row));
        const byLocalKey = new Map(relatedInstances.map((instance: any) => [instance[localKey], instance]));

        for (const parent of parents) {
            parent[relation.property] = byLocalKey.get(parent[relation.foreignKey]) ?? null;
        }
    }

    /** belongsToMany: two queries — parent ids -> pivot rows, then pivot's related ids -> related rows. */
    private async loadBelongsToMany(
        parentModelClass: any,
        parents: any[],
        relation: RelationDefinition
    ): Promise<void> {
        const RelatedModel = relation.related();
        const relatedTable = SchemaRegistry.getTable(RelatedModel);
        const localKey = relation.localKey ?? SchemaRegistry.getPrimaryKey(parentModelClass) ?? "id";
        const relatedLocalKey = SchemaRegistry.getPrimaryKey(RelatedModel) ?? "id";

        const pivotTable = relation.pivotTable;
        const relatedPivotKey = relation.relatedPivotKey;
        if (!pivotTable || !relatedPivotKey) {
            throw new Error(
                `${parentModelClass.name}.${relation.property} is a belongsToMany relation missing pivotTable/relatedPivotKey.`
            );
        }

        const localValues = [...new Set(parents.map((p) => p[localKey]).filter((v) => v !== undefined))];
        if (localValues.length === 0) {
            for (const parent of parents) parent[relation.property] = [];
            return;
        }

        // The pivot table has no Model/SchemaRegistry entry of its own (it's
        // a plain join table, not a domain entity), so it can't go through
        // the typed `.select().from(table)` builder the way every other
        // relation kind does — that builder needs a Drizzle table object,
        // which only exists for tables backed by a @Table()-decorated Model.
        // A parameterized `sql` tagged-template query against the pivot
        // table by name is the dialect-agnostic way to read it instead;
        // `sql.join(values, sql\`, \`)` binds each value as a real parameter,
        // not string-interpolated, so this is safe against SQL injection
        // via `localValues` the same way the typed query builder is.
        const idList = sql.join(
            localValues.map((v) => sql`${v}`),
            sql.raw(", ")
        );
        const pivotQuery = sql`SELECT * FROM ${sql.identifier(pivotTable)} WHERE ${sql.identifier(relation.foreignKey)} IN (${idList})`;

        const pivotRows: any[] = await this.execRaw(pivotQuery);

        const relatedIds = [...new Set(pivotRows.map((row: any) => row[relatedPivotKey]))];
        if (relatedIds.length === 0) {
            for (const parent of parents) parent[relation.property] = [];
            return;
        }

        const relatedIdCondition = inArray(relatedTable[relatedLocalKey], relatedIds);
        const relatedScope = this.tenantScope(RelatedModel);
        const relatedRows = await this.connection
            .select()
            .from(relatedTable)
            .where(relatedScope ? and(relatedIdCondition, relatedScope) : relatedIdCondition);

        const relatedById = new Map(
            relatedRows.map((row: any) => [row[relatedLocalKey], Object.assign(new RelatedModel(), row)])
        );

        const relatedIdsByParent = new Map<any, any[]>();
        for (const pivotRow of pivotRows) {
            const parentId = pivotRow[relation.foreignKey];
            const bucket = relatedIdsByParent.get(parentId);
            const relatedInstance = relatedById.get(pivotRow[relatedPivotKey]);
            if (!relatedInstance) continue;
            if (bucket) bucket.push(relatedInstance);
            else relatedIdsByParent.set(parentId, [relatedInstance]);
        }

        for (const parent of parents) {
            parent[relation.property] = relatedIdsByParent.get(parent[localKey]) ?? [];
        }
    }

    /**
     * The tenant WHERE condition for `modelClass`'s table, or undefined if
     * it's not tenant-scoped — the same fail-closed policy Model/QueryBuilder
     * enforce on the main query, applied here to related tables too. Without
     * this, a tenant-scoped parent row's relation would silently pull
     * *every* tenant's related rows matching the foreign key, not just the
     * active tenant's — a real cross-tenant data leak, not a cosmetic gap.
     */
    private tenantScope(relatedModelClass: any): SQL | undefined {
        const table = SchemaRegistry.getTable(relatedModelClass);
        if (!table.tenantId) return undefined;

        const tenantId = TenantContext.get();
        if (!tenantId) {
            throw new Error(
                `Tenant context required: ${relatedModelClass.name}'s table has a tenant_id column ` +
                    `but no tenant is active for the current request/transaction.`
            );
        }
        return TenantScope.getScope(relatedModelClass, tenantId);
    }

    /**
     * Executes a raw parameterized `sql` tagged-template query and returns
     * its rows as plain objects. Every driver this package supports shapes
     * its raw-query result differently — verified empirically against live
     * connections for all four, not assumed from types:
     *   - better-sqlite3: no `.execute()` at all; `.all(query)` returns the
     *     row array directly.
     *   - node-postgres ("pg"): `.execute()` resolves an object with a
     *     `.rows` array (plus driver metadata alongside it).
     *   - postgres-js ("postgres"): `.execute()` resolves the row array
     *     itself at the top level.
     *   - mysql2: `.execute()` resolves a 2-element tuple `[rows, fields]`.
     * `dialect` alone ("postgres" covers both pg and postgres-js, which
     * shape their result differently) isn't enough to disambiguate, so this
     * detects the shape at runtime instead of trusting the driver name.
     */
    private async execRaw(query: any): Promise<any[]> {
        if (SchemaRegistry.getDialect() === "sqlite") {
            return this.connection.all(query);
        }

        const result = await this.connection.execute(query);

        if (Array.isArray(result)) {
            // mysql2's [rows, fields] vs postgres-js's row array itself:
            // only mysql2 nests a second array (the row array) as element 0.
            return Array.isArray(result[0]) ? result[0] : result;
        }

        return result.rows ?? result;
    }
}

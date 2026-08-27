import { SchemaRegistry } from "./schema/registry";

/**
 * Executes a raw parameterized `sql` tagged-template query (or, for
 * dialects/drivers that support it, a raw SQL string) against any of this
 * package's four supported connections and returns its rows as plain
 * objects — regardless of driver.
 *
 * Every driver this package supports shapes its raw-query result
 * differently, verified empirically against live connections for all four,
 * not assumed from types:
 *   - better-sqlite3: no `.execute()` at all; `.all(query)` returns the row
 *     array directly.
 *   - node-postgres ("pg"): `.execute()` resolves an object with a `.rows`
 *     array (plus driver metadata alongside it).
 *   - postgres-js ("postgres"): `.execute()` resolves the row array itself
 *     at the top level.
 *   - mysql2: `.execute()` resolves a 2-element tuple `[rows, fields]`.
 *
 * `SchemaRegistry.getDialect()` alone ("postgres" covers both pg and
 * postgres-js, which shape their result differently) isn't enough to
 * disambiguate, so this detects the shape at runtime instead of trusting
 * the driver name.
 *
 * Originally lived only inside RelationLoader (for pivot-table queries);
 * extracted here so TenantMigrationService's schema/row-copy operations —
 * which need the exact same cross-dialect raw execution — share one
 * implementation instead of a second hand-rolled copy.
 */
export async function execRaw(connection: any, query: any): Promise<any[]> {
    if (SchemaRegistry.getDialect() === "sqlite") {
        return connection.all(query);
    }

    const result = await connection.execute(query);

    if (Array.isArray(result)) {
        // mysql2's [rows, fields] vs postgres-js's row array itself: only
        // mysql2 nests a second array (the row array) as element 0.
        return Array.isArray(result[0]) ? result[0] : result;
    }

    return result.rows ?? result;
}

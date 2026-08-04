import { randomUUID } from "crypto";

/**
 * In-memory fake for the drizzle `db` singleton (database/connection.ts),
 * so repository tests can exercise BaseRepository's tenant-scoping logic
 * without a live Postgres connection. Supports the exact chain shapes
 * BaseRepository uses: select().from().where().limit()/.offset(), insert()
 * .values().returning(), update().set().where().returning(), delete()
 * .where().returning().
 *
 * Only understands simple `eq`/`and` SQL trees built by drizzle-orm's
 * `eq`/`and` helpers — enough to evaluate the where clauses BaseRepository
 * constructs (tenant filter, id filter, and combinations of the two).
 */
export class FakeDb {
    private tables = new Map<any, any[]>();

    seed(table: any, rows: any[]): void {
        this.tables.set(table, [...rows]);
    }

    rows(table: any): any[] {
        return this.tables.get(table) ?? [];
    }

    select() {
        const self = this;
        let currentTable: any;
        let whereCondition: any;
        let limitCount: number | undefined;
        let offsetCount: number | undefined;

        const chain: any = {
            from(table: any) {
                currentTable = table;
                return chain;
            },
            where(condition: any) {
                whereCondition = condition;
                return chain;
            },
            limit(n: number) {
                limitCount = n;
                return chain;
            },
            offset(n: number) {
                offsetCount = n;
                return chain;
            },
            then(resolve: any, reject: any) {
                try {
                    let results = self.rows(currentTable).filter((row) => matches(row, whereCondition));
                    if (offsetCount !== undefined) results = results.slice(offsetCount);
                    if (limitCount !== undefined) results = results.slice(0, limitCount);
                    resolve(results);
                } catch (e) {
                    reject(e);
                }
            },
        };

        return chain;
    }

    insert(table: any) {
        const self = this;
        return {
            values(data: any) {
                return {
                    returning() {
                        const row = { id: data.id ?? randomUUID(), ...data };
                        const existing = self.tables.get(table) ?? [];
                        existing.push(row);
                        self.tables.set(table, existing);
                        return Promise.resolve([row]);
                    },
                };
            },
        };
    }

    update(table: any) {
        const self = this;
        return {
            set(data: any) {
                return {
                    where(condition: any) {
                        return {
                            returning() {
                                const rows = self.rows(table);
                                const updated: any[] = [];
                                for (let i = 0; i < rows.length; i++) {
                                    if (matches(rows[i], condition)) {
                                        rows[i] = { ...rows[i], ...data };
                                        updated.push(rows[i]);
                                    }
                                }
                                return Promise.resolve(updated);
                            },
                        };
                    },
                };
            },
        };
    }

    delete(table: any) {
        const self = this;
        return {
            where(condition: any) {
                return {
                    returning() {
                        const rows = self.rows(table);
                        const remaining: any[] = [];
                        const deleted: any[] = [];
                        for (const row of rows) {
                            if (matches(row, condition)) {
                                deleted.push(row);
                            } else {
                                remaining.push(row);
                            }
                        }
                        self.tables.set(table, remaining);
                        return Promise.resolve(deleted);
                    },
                };
            },
        };
    }
}

/**
 * Evaluates the SQL condition trees produced by drizzle-orm's `eq`/`and`
 * against a plain row object.
 *
 * drizzle-orm SQL objects expose their pieces via a `queryChunks` array.
 * `eq(column, value)` produces chunks shaped like
 * [StringChunk(""), Column, StringChunk(" = "), Param(value), StringChunk("")]
 * — a column chunk (carries `.name`) immediately followed two slots later by
 * a Param chunk (carries `.value`). `and(...conditions)` wraps `"("`, each
 * condition (itself a nested SQL object with its own `queryChunks`), `")"`.
 * We recursively collect every (column name, value) pair found anywhere in
 * the tree — sufficient for the flat eq/and filters BaseRepository builds
 * (it never uses or/not/gt/etc).
 */
function collectPairs(condition: any, out: Array<{ name: string; value: any }>): void {
    const chunks: any[] = condition?.queryChunks ?? [];
    for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        if (!chunk || typeof chunk !== "object") continue;

        if (Array.isArray(chunk.queryChunks)) {
            // Nested SQL (e.g. one operand of `and(...)`) — recurse.
            collectPairs(chunk, out);
            continue;
        }

        if ("name" in chunk && typeof chunk.name === "string") {
            const param = chunks[i + 2];
            if (param && typeof param === "object" && "value" in param && !Array.isArray(param.value)) {
                out.push({ name: chunk.name, value: param.value });
            }
        }
    }
}

function matches(row: any, condition: any): boolean {
    if (!condition) return true;

    const pairs: Array<{ name: string; value: any }> = [];
    collectPairs(condition, pairs);

    if (pairs.length === 0) return true;

    return pairs.every(({ name, value }) => {
        // Map snake_case drizzle column names back to the camelCase row keys
        // the fake store uses (BaseRepository/consumers work with camelCase).
        const key = name.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
        return row[key] === value;
    });
}

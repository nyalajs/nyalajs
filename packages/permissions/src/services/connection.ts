import { Model, TransactionContext } from "@nyalajs/database";

/**
 * The connection to run a raw pivot-table write against: the active
 * transaction if one is open, otherwise the global pool — same resolution
 * Model's own (private) `connection()` helper uses internally, replicated
 * here since these are the raw pivot writes @nyalajs/database itself has
 * no attach()/detach()/sync() helper for (see role.service.ts's module
 * comment). Typed `any`, matching Model's own private helper — Drizzle's
 * per-dialect `.insert()`/`.delete()` overloads are a union type that
 * TypeScript can't call through without dialect-specific narrowing, and
 * this code (like Model's) is deliberately dialect-agnostic.
 */
export function connection(): any {
    return TransactionContext.get() ?? Model.db;
}

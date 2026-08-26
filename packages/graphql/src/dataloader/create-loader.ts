import DataLoader from "dataloader";

/**
 * Thin re-export of `dataloader` with a Nyala-flavored factory: batches keys
 * within one tick/microtask, and — the part that actually matters for a
 * multi-tenant app — a loader must be created FRESH per request (per
 * GraphqlContext), never module-level/singleton. A shared loader would cache
 * across requests and, worse, across tenants: tenant B's resolver could get
 * back a row DataLoader cached from tenant A's query. createLoader() exists
 * mainly as a named, documented entry point for this so it isn't reinvented
 * ad hoc per resolver — see GraphqlContext.loaders in graphql-context.ts for
 * where per-request loaders are meant to live.
 */
export function createLoader<K, V>(
    batchLoadFn: (keys: readonly K[]) => Promise<ArrayLike<V | Error>>,
    options?: DataLoader.Options<K, V>
): DataLoader<K, V> {
    return new DataLoader(batchLoadFn, options);
}

export { DataLoader };

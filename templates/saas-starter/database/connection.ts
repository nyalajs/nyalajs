import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

/**
 * Database Connection
 *
 * Establishes the app's single real PostgreSQL connection pool via Drizzle
 * ORM + postgres-js. Every repository (thin wrappers around @nyalajs/
 * database Model classes — see app/models/*.ts) and @nyalajs/permissions
 * both reach this exact instance via `Model.setDatabase(db)`, called once in
 * bootstrap/main.ts — never construct a second pool/connection anywhere
 * else in the app for the SHARED database (a dedicated tenant's own
 * database is a deliberate exception — see @nyalajs/tenancy's
 * TenantConnectionManager, wired in bootstrap/app.module.ts).
 *
 * No `{ schema }` passed to drizzle() here (unlike a plain Drizzle app) —
 * every app/models/*.ts class is a Model, not a raw Drizzle table object;
 * Model builds its own table definitions lazily via SchemaRegistry instead
 * of drizzle-orm's schema-object constructor argument. `{ schema }` would
 * only matter for Drizzle's relational query API (`db.query.users...`),
 * which this app doesn't use.
 *
 * Multi-tenant isolation is enforced by Model itself (TenantContext-based,
 * mandatory for any table with a `tenantId` column) — not by this
 * connection.
 */

const connectionString =
    process.env.DATABASE_URL ||
    `postgresql://${process.env.DB_USER || "postgres"}:${process.env.DB_PASSWORD || ""}@${process.env.DB_HOST || "localhost"}:${process.env.DB_PORT || 5432}/${process.env.DB_NAME || "nyala_saas"}`;

if (!process.env.DATABASE_URL && !process.env.DB_HOST && process.env.NODE_ENV === "production") {
    // Not a hard failure (some deploys inject DATABASE_URL after this module
    // first evaluates, e.g. certain secret managers) — but a production
    // process silently falling back to `localhost` is exactly the kind of
    // failure that's invisible until it's an incident. Fail loud instead.
    throw new Error(
        "DATABASE_URL (or DB_HOST) is not set. Refusing to start in production against a " +
        "default localhost connection string — set DATABASE_URL in your environment."
    );
}

// SSL: most managed Postgres providers (RDS, Supabase, Neon, Render, Railway,
// etc.) require TLS and present a certificate chain that Node's default
// trust store may not carry — `require` mode encrypts the connection
// without verifying the CA, which matches what those providers document for
// app-side connections. Set DB_SSL_REJECT_UNAUTHORIZED=true (with a CA you
// trust configured) for full certificate verification instead. Set
// DATABASE_SSL=false to disable TLS entirely for a local/self-hosted DB that
// doesn't support it.
const sslEnabled = process.env.DATABASE_SSL !== "false" && process.env.NODE_ENV === "production";
const ssl = sslEnabled
    ? { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED === "true" }
    : undefined;

// Pool sizing: `max` should stay well under your Postgres server's own
// max_connections divided by the number of app instances you run — 10 is a
// reasonable default for a single instance talking to a typical managed
// Postgres tier. Tune via DB_POOL_MAX for your own deployment topology.
const client = postgres(connectionString, {
    max: Number(process.env.DB_POOL_MAX) || 10,
    idle_timeout: Number(process.env.DB_IDLE_TIMEOUT) || 20,
    connect_timeout: Number(process.env.DB_CONNECT_TIMEOUT) || 10,
    ssl,
    onnotice: process.env.DB_LOG_NOTICES === "true" ? undefined : () => {},
});

export const db = drizzle(client);

/** Real connectivity probe — used by the /health/ready indicator and safe to call from anywhere (e.g. a smoke test) that just needs to know "can we reach Postgres right now". */
export async function pingDatabase(): Promise<void> {
    await client`select 1`;
}

/** Closes the pool. Call once, on graceful shutdown only (see bootstrap/main.ts's SIGTERM/SIGINT handlers) — never per-request. */
export async function closeConnection(): Promise<void> {
    await client.end();
}

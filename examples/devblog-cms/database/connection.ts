import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../app/models";

/**
 * Database Connection
 *
 * Establishes the connection to PostgreSQL using Drizzle ORM. Imported by
 * repositories (via app/repositories/base.repository.ts) and by the CLI's
 * migration/seed runners.
 */

const connectionString =
    process.env.DATABASE_URL ||
    `postgresql://${process.env.DB_USER || "postgres"}:${process.env.DB_PASSWORD || ""}@${
        process.env.DB_HOST || "localhost"
    }:${process.env.DB_PORT || 5432}/${process.env.DB_NAME || "nyala_cms"}`;

const client = postgres(connectionString, {
    max: 10,
    idle_timeout: 20,
    connect_timeout: 10,
});

export const db = drizzle(client, { schema });

export async function closeConnection() {
    await client.end();
}

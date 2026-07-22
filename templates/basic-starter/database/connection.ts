import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../app/models";

/**
 * Database Connection
 *
 * Establishes connection to PostgreSQL database using Drizzle ORM.
 */

// Connection configuration from environment
const connectionString = process.env.DATABASE_URL || `postgresql://${process.env.DB_USER || "postgres"}:${process.env.DB_PASSWORD || ""}@${process.env.DB_HOST || "localhost"}:${process.env.DB_PORT || 5432}/${process.env.DB_NAME || "nyala_mvc"}`;

// Create postgres connection
const client = postgres(connectionString, {
    max: 10,
    idle_timeout: 20,
    connect_timeout: 10,
});

// Create drizzle instance
export const db = drizzle(client, { schema });

/**
 * Close database connection
 */
export async function closeConnection() {
    await client.end();
}

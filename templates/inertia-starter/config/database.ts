/**
 * Database Configuration
 *
 * Defaults to better-sqlite3 (a single on-disk file, DB_PATH — or
 * ":memory:" for a throwaway DB), so this starter runs with zero external
 * services to install/configure. @nyalajs/database's DatabaseService
 * supports pg/postgres/mysql2 too (see packages/database/src/database.service.ts)
 * — swap DB_DRIVER + the other DB_* vars in .env for a real deployment.
 */

export default {
    driver: process.env.DB_DRIVER || "better-sqlite3",
    path: process.env.DB_PATH || "./storage/database.sqlite",
    // Only used when DB_DRIVER is pg/postgres/mysql2.
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT) || 5432,
    database: process.env.DB_NAME || "nyala_inertia",
    username: process.env.DB_USER || "postgres",
    password: process.env.DB_PASSWORD || "",
    url: process.env.DATABASE_URL || "",
};

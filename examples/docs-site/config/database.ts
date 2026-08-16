/**
 * Database Configuration
 *
 * Defaults to better-sqlite3 (a single on-disk file, DB_PATH — or
 * ":memory:" for a throwaway DB), so this app runs with zero external
 * services to install/configure. Same as templates/inertia-starter/config/database.ts.
 */

export default {
    driver: process.env.DB_DRIVER || "better-sqlite3",
    path: process.env.DB_PATH || "./storage/database.sqlite",
};

/**
 * Database Configuration
 *
 * MySQL, via mysql2 (see database/connection.ts). DATABASE_URL takes
 * precedence if set; otherwise the discrete DB_HOST/DB_PORT/DB_USER/
 * DB_PASSWORD/DB_NAME vars are combined into a connection URI.
 */

export default {
    driver: process.env.DB_DRIVER || "mysql2",
    url: process.env.DATABASE_URL || "",
    host: process.env.DB_HOST || "127.0.0.1",
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "nyaladocs",
};

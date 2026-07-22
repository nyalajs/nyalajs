/**
 * Database Configuration
 */

export default {
    driver: process.env.DB_DRIVER || "postgres",
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT) || 5432,
    database: process.env.DB_NAME || "nyala_mvc",
    username: process.env.DB_USER || "postgres",
    password: process.env.DB_PASSWORD || "",
    url: process.env.DATABASE_URL || "",
    pool: {
        min: Number(process.env.DB_POOL_MIN) || 2,
        max: Number(process.env.DB_POOL_MAX) || 10,
    },
    ssl: process.env.DB_SSL === "true",
};

export default {
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT) || 5432,
    database: process.env.DB_NAME || "nyala_cms",
    username: process.env.DB_USER || "postgres",
    password: process.env.DB_PASSWORD || "",
    url: process.env.DATABASE_URL || "",
};

/**
 * Application Configuration
 */

export default {
    name: process.env.APP_NAME || "Nyala Docs",
    env: process.env.NODE_ENV || "development",
    url: process.env.APP_URL || "http://localhost:3000",
    version: "1.0.0",
    debug: process.env.APP_DEBUG === "true",
    timezone: process.env.APP_TIMEZONE || "UTC",
    // bcrypt hash of the single admin password that gates doc
    // create/update/delete (see app/guards/admin.guard.ts,
    // app/controllers/auth.controller.ts). Never a plaintext password in
    // env — .env.example documents how to generate this hash. Empty by
    // default so a fresh clone's admin login always fails closed instead
    // of silently accepting an empty password.
    adminPasswordHash: process.env.ADMIN_PASSWORD_HASH || "",
};

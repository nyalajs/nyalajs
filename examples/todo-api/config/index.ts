import app from "./app";
import server from "./server";
import database from "./database";
import auth from "./auth";
import cors from "./cors";
import security from "./security";
import logging from "./logging";

/**
 * Configuration Namespaces
 *
 * Aggregates all configuration files into a single export.
 * Each config file is loaded as a namespace in ConfigService.
 *
 * Access values with: config.get("namespace.key")
 * Example: config.get("server.port") or config.get("database.host")
 */

export const namespaces = {
    app,
    server,
    database,
    auth,
    cors,
    security,
    logging,
};

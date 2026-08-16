import app from "./app";
import server from "./server";
import database from "./database";
import logging from "./logging";
import inertia from "./inertia";

/**
 * Configuration Namespaces
 *
 * Aggregates all configuration files into a single export.
 * Each config file is loaded as a namespace in ConfigService.
 *
 * Access values with: config.get("namespace.key")
 * Example: config.get("server.port") or config.get("database.path")
 */

export const namespaces = {
    app,
    server,
    database,
    logging,
    inertia,
};

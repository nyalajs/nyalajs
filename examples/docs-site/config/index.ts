import app from "./app";
import server from "./server";
import logging from "./logging";
import inertia from "./inertia";
import docs from "./docs";

/**
 * Configuration Namespaces
 *
 * Aggregates all configuration files into a single export.
 * Each config file is loaded as a namespace in ConfigService.
 *
 * Access values with: config.get("namespace.key")
 * Example: config.get("server.port") or config.get("docs.sourceDir")
 */

export const namespaces = {
    app,
    server,
    logging,
    inertia,
    docs,
};

import app from "./app";
import server from "./server";
import database from "./database";
import security from "./security";
import logging from "./logging";
import storage from "./storage";

/**
 * Configuration Namespaces
 *
 * Aggregates all configuration files into a single export, loaded into
 * ConfigService in bootstrap/app.module.ts. Access with
 * config.get("namespace.key"), e.g. config.get("server.port").
 */
export const namespaces = {
    app,
    server,
    database,
    security,
    logging,
    storage,
};

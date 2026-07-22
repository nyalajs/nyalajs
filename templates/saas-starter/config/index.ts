import appConfig from "./app";
import serverConfig from "./server";
import databaseConfig from "./database";
import authConfig from "./auth";
import cacheConfig from "./cache";
import queueConfig from "./queue";
import mailConfig from "./mail";
import storageConfig from "./storage";
import loggingConfig from "./logging";
import corsConfig from "./cors";
import securityConfig from "./security";
import sessionConfig from "./session";
import pluginsConfig from "./plugins";
import middlewareConfig from "./middleware";

export const namespaces: Record<string, Record<string, any>> = {
  app: appConfig,
  server: serverConfig,
  database: databaseConfig,
  auth: authConfig,
  cache: cacheConfig,
  queue: queueConfig,
  mail: mailConfig,
  storage: storageConfig,
  logging: loggingConfig,
  cors: corsConfig,
  security: securityConfig,
  session: sessionConfig,
  plugins: pluginsConfig,
  middleware: middlewareConfig,
};

export default namespaces;

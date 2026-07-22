import * as fs from "fs-extra";
import * as path from "path";
import chalk from "chalk";
import ora from "ora";
import inquirer from "inquirer";
import { printWelcomeBanner } from "../utils/banner";

/**
 * Application-level folder structure, per docs/requirements.md §3.1.
 * Framework internals (packages/core, packages/http, ...) are unaffected —
 * this is only the convention `nyala new` scaffolds for consuming apps.
 */
const APP_SUBFOLDERS = [
  "controllers",
  "models",
  "services",
  "repositories",
  "middleware",
  "requests",
  "resources",
  "validators",
  "policies",
  "events",
  "listeners",
  "jobs",
  "mail",
  "notifications",
  "exceptions",
  "dto",
  "enums",
  "interfaces",
  "contracts",
  "helpers",
];

const EMPTY_TOP_LEVEL_FOLDERS = [
  "database/migrations",
  "database/seeders",
  "database/factories",
  "routes",
  "storage",
  "public",
  "resources",
  "tests",
  "docs",
  "plugins",
  "framework",
];

export class NewCommand {
  async execute(name: string | undefined, options: any): Promise<void> {
    let projectName = name;
    let dbDriver = options.database || "postgres";
    let template = options.template || null;

    // Interactive prompts if options not provided
    const prompts: any[] = [];

    if (!projectName) {
      prompts.push({
        type: "input",
        name: "projectName",
        message: "What is the name of your new Nyala project?",
        validate: (input) => (input ? true : "Project name is required"),
      });
    }

    if (!template) {
      prompts.push({
        type: "list",
        name: "template",
        message: "Which starter template would you like to use?",
        choices: [
          {
            name: "MVC Starter - Standard MVC application with auth & CRUD",
            value: "mvc",
          },
          {
            name: "SaaS Starter - Multi-tenant SaaS with advanced features",
            value: "saas",
          },
          {
            name: "Basic - Minimal setup (current default)",
            value: "basic",
          },
        ],
        default: "mvc",
      });
    }

    if (!options.database) {
      prompts.push({
        type: "list",
        name: "dbDriver",
        message: "Which database driver would you like to use?",
        choices: [
          { name: "PostgreSQL (recommended)", value: "postgres" },
          { name: "MySQL", value: "mysql" },
          { name: "SQLite", value: "sqlite" },
        ],
      });
    }

    if (prompts.length > 0) {
      const answers = await inquirer.prompt(prompts);
      projectName = projectName || answers.projectName;
      template = template || answers.template;
      dbDriver = options.database || answers.dbDriver;
    }

    const spinner = ora(`Creating new Nyala application: ${projectName}`).start();

    try {
      const projectPath = path.join(process.cwd(), projectName!);

      if (await fs.pathExists(projectPath)) {
        spinner.fail(`Directory ${projectName} already exists`);
        return;
      }

      // Check if template directory exists
      const templatePath = path.join(__dirname, "../../../templates", `${template}-starter`);
      const templateExists = await fs.pathExists(templatePath);

      if (templateExists && template !== "basic") {
        spinner.text = `Copying ${template} starter template...`;
        await this.copyTemplate(templatePath, projectPath, projectName!);
      } else {
        spinner.text = `Creating basic project structure...`;
        await this.createProjectStructure(projectPath, projectName!);
      }

      spinner.succeed(
        chalk.bold.hex("#3AF08A")(
          `✓ Project '${projectName}' created successfully!`
        )
      );

      printWelcomeBanner(projectName!);
    } catch (error) {
      spinner.fail("Failed to create application");
      console.error(error);
    }
  }

  /**
   * Copy template files to project directory
   */
  private async copyTemplate(
    templatePath: string,
    projectPath: string,
    projectName: string
  ): Promise<void> {
    // Copy all files from template
    await fs.copy(templatePath, projectPath, {
      filter: (src) => {
        // Exclude node_modules, dist, and other build artifacts
        const relativePath = path.relative(templatePath, src);
        return (
          !relativePath.includes("node_modules") &&
          !relativePath.includes("dist") &&
          !relativePath.includes(".turbo") &&
          !relativePath.startsWith(".git")
        );
      },
    });

    // Update package.json with project name
    const packageJsonPath = path.join(projectPath, "package.json");
    if (await fs.pathExists(packageJsonPath)) {
      const packageJson = await fs.readJSON(packageJsonPath);
      packageJson.name = projectName;
      await fs.writeJSON(packageJsonPath, packageJson, { spaces: 2 });
    }
  }

  private async createProjectStructure(projectPath: string, name: string): Promise<void> {
    for (const sub of APP_SUBFOLDERS) {
      await fs.ensureDir(path.join(projectPath, "app", sub));
      await fs.writeFile(path.join(projectPath, "app", sub, ".gitkeep"), "");
    }

    for (const folder of EMPTY_TOP_LEVEL_FOLDERS) {
      await fs.ensureDir(path.join(projectPath, folder));
      await fs.writeFile(path.join(projectPath, folder, ".gitkeep"), "");
    }

    await fs.ensureDir(path.join(projectPath, "config"));
    await fs.ensureDir(path.join(projectPath, "bootstrap"));

    await fs.writeFile(
      path.join(projectPath, "database/migrations/README.md"),
      "No migration runner ships yet — see docs/requirements.md §4.10. `nyala generate migration <name>` reserves this location.\n"
    );
    await fs.writeFile(
      path.join(projectPath, "database/seeders/README.md"),
      "No seeder runner ships yet — see docs/requirements.md §4.10.\n"
    );
    await fs.writeFile(
      path.join(projectPath, "database/factories/README.md"),
      "No model factory support ships yet — see docs/requirements.md §4.10.\n"
    );
    await fs.writeFile(
      path.join(projectPath, "plugins/README.md"),
      "No plugin loader ships yet — see docs/requirements.md §5. Plugins placed here are not auto-discovered until it does.\n"
    );
    await fs.writeFile(
      path.join(projectPath, "framework/README.md"),
      "Reserved for local framework overrides/extensions. Prefer packages published to node_modules; use this only for app-specific patches.\n"
    );

    await this.writeConfigFiles(projectPath);

    await fs.writeFile(
      path.join(projectPath, "config/index.ts"),
      this.getConfigIndexTemplate()
    );

    await fs.writeFile(
      path.join(projectPath, "routes/api.ts"),
      this.getRoutesTemplate()
    );

    await fs.writeFile(
      path.join(projectPath, "bootstrap/app.module.ts"),
      this.getAppModuleTemplate()
    );

    await fs.writeFile(
      path.join(projectPath, "bootstrap/main.ts"),
      this.getMainTemplate()
    );

    await fs.writeJSON(
      path.join(projectPath, "package.json"),
      this.getPackageJson(name),
      { spaces: 2 }
    );

    await fs.writeJSON(
      path.join(projectPath, "tsconfig.json"),
      this.getTsConfig(),
      { spaces: 2 }
    );

    await fs.writeFile(path.join(projectPath, ".env"), this.getEnvTemplate());
    await fs.writeFile(path.join(projectPath, ".env.example"), this.getEnvTemplate());
    await fs.writeFile(path.join(projectPath, ".gitignore"), this.getGitignore());
    await fs.writeFile(path.join(projectPath, "README.md"), this.getReadmeTemplate(name));
  }

  private async writeConfigFiles(projectPath: string): Promise<void> {
    const configDir = path.join(projectPath, "config");

    const files: Record<string, string> = {
      "app.ts": `export default {
  name: process.env.APP_NAME || "Nyala App",
  env: process.env.NODE_ENV || "development",
  url: process.env.APP_URL || "http://localhost:3000",
};
`,
      "server.ts": `export default {
  host: process.env.HOST || "0.0.0.0",
  port: Number(process.env.PORT) || 3000,
  bodyLimit: Number(process.env.BODY_LIMIT) || 1_048_576,
};
`,
      "database.ts": `// No ORM/database adapter ships yet — see docs/requirements.md §4.8-4.9.
// This reserves the shape so app/models, app/repositories, and
// database/migrations can be wired up without a breaking config change.
export default {
  driver: process.env.DB_DRIVER || "postgres",
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME || "nyala",
  username: process.env.DB_USER || "postgres",
  password: process.env.DB_PASSWORD || "",
};
`,
      "auth.ts": `export default {
  jwt: {
    secret: process.env.JWT_SECRET || "change-me-in-production",
    expiresIn: process.env.JWT_EXPIRES_IN || "1h",
  },
};
`,
      "cache.ts": `// No cache module ships yet — see docs/requirements.md §4.13.
export default {
  driver: process.env.CACHE_DRIVER || "memory",
};
`,
      "queue.ts": `// No queue module ships yet — see docs/requirements.md §4.14.
export default {
  driver: process.env.QUEUE_DRIVER || "sync",
};
`,
      "mail.ts": `// No mail module ships yet — see docs/requirements.md §4.17.
export default {
  driver: process.env.MAIL_DRIVER || "smtp",
  from: process.env.MAIL_FROM || "noreply@example.com",
};
`,
      "storage.ts": `export default {
  driver: process.env.STORAGE_DRIVER || "local",
  local: {
    root: process.env.STORAGE_LOCAL_ROOT || "./storage",
  },
};
`,
      "logging.ts": `export default {
  level: process.env.LOG_LEVEL || "info",
  pretty: process.env.NODE_ENV !== "production",
};
`,
      "cors.ts": `export default {
  origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(",") : "*",
  credentials: process.env.CORS_CREDENTIALS === "true",
};
`,
      "security.ts": `export default {
  rateLimit: {
    max: Number(process.env.RATE_LIMIT_MAX) || 100,
    windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS) || 60_000,
  },
};
`,
      "session.ts": `// No session module ships yet — see docs/requirements.md §4.21.
export default {
  driver: process.env.SESSION_DRIVER || "cookie",
};
`,
      "plugins.ts": `// No plugin loader ships yet — see docs/requirements.md §5.
export default [];
`,
    };

    for (const [fileName, contents] of Object.entries(files)) {
      await fs.writeFile(path.join(configDir, fileName), contents);
    }
  }

  private getPackageJson(name: string): any {
    return {
      name,
      version: "0.1.0",
      private: true,
      scripts: {
        dev: "ts-node bootstrap/main.ts",
        build: "tsc",
        start: "node dist/bootstrap/main.js",
        test: "vitest run",
      },
      dependencies: {
        "@nyala/core": "^0.1.0",
        "@nyala/http": "^0.1.0",
        "@nyala/config": "^0.1.0",
        "reflect-metadata": "^0.2.1",
      },
      devDependencies: {
        typescript: "^5.3.3",
        "ts-node": "^10.9.2",
        "@types/node": "^20.10.6",
        vitest: "^1.0.4",
      },
    };
  }

  private getTsConfig(): any {
    return {
      compilerOptions: {
        target: "ES2022",
        module: "commonjs",
        lib: ["ES2022"],
        outDir: "./dist",
        rootDir: "./",
        strict: true,
        esModuleInterop: true,
        skipLibCheck: true,
        forceConsistentCasingInFileNames: true,
        experimentalDecorators: true,
        emitDecoratorMetadata: true,
        moduleResolution: "node",
        resolveJsonModule: true,
      },
      include: ["app/**/*", "bootstrap/**/*", "config/**/*", "routes/**/*", "database/**/*"],
      exclude: ["node_modules", "dist", "tests"],
    };
  }

  private getEnvTemplate(): string {
    return `NODE_ENV=development
PORT=3000
LOG_LEVEL=info

# JWT Configuration
JWT_SECRET=your-secret-key-change-in-production
JWT_EXPIRES_IN=1h
`;
  }

  private getGitignore(): string {
    return `node_modules/
dist/
*.log
.env
.env.local
.DS_Store
coverage/
`;
  }

  private getConfigIndexTemplate(): string {
    return `import app from "./app";
import server from "./server";
import database from "./database";
import auth from "./auth";
import cache from "./cache";
import queue from "./queue";
import mail from "./mail";
import storage from "./storage";
import logging from "./logging";
import cors from "./cors";
import security from "./security";
import session from "./session";
import plugins from "./plugins";

// Aggregates every config/*.ts namespace so bootstrap/app.module.ts can
// load them all into ConfigService in one place. Read values back with
// configService.get("server.port") or configService.getNamespace("database").
export const namespaces = {
  app,
  server,
  database,
  auth,
  cache,
  queue,
  mail,
  storage,
  logging,
  cors,
  security,
  session,
  plugins,
};
`;
  }

  private getRoutesTemplate(): string {
    return `// Route registration is decorator-driven today: add @Controller +
// @Get/@Post/... on a class in app/controllers, then register the
// controller in bootstrap/app.module.ts (nyala generate controller does
// this automatically).
//
// This file is reserved for a future file-based route table (named
// routes, groups, versioning — see docs/requirements.md §4.3).
export {};
`;
  }

  private getAppModuleTemplate(): string {
    return `import { Module } from "@nyala/core";
import { ConfigService } from "@nyala/config";
import { namespaces } from "../config";

// \`nyala generate controller|service\` appends entries here automatically.
@Module({
  imports: [],
  providers: [
    {
      provide: ConfigService,
      useFactory: () => {
        const configService = new ConfigService();
        for (const [namespace, values] of Object.entries(namespaces)) {
          configService.load(namespace, values as Record<string, any>);
        }
        return configService;
      },
    },
  ],
  controllers: [],
})
export class AppModule {}
`;
  }

  private getMainTemplate(): string {
    return `import "reflect-metadata";
import { NyalaFactory } from "@nyala/core";
import { FastifyAdapter } from "@nyala/http";
import { ConfigService } from "@nyala/config";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NyalaFactory.create(AppModule);
  const config = app.get<ConfigService>(ConfigService);

  const httpAdapter = new FastifyAdapter(app.getKernel().getContainer(), {
    cors: true,
    helmet: true,
    rateLimit: true,
  });

  app.setHttpAdapter(httpAdapter);

  // Graceful shutdown
  const shutdown = () => app.close().then(() => process.exit(0));
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  const port = config.get<number>("server.port", 3000);
  const host = config.get<string>("server.host", "0.0.0.0");

  await app.listen(port, host);
  console.log(\`Server running at http://\${host}:\${port}\`);
}

bootstrap().catch((error) => {
  console.error("Failed to start application:", error);
  process.exit(1);
});
`;
  }

  private getReadmeTemplate(name: string): string {
    return `# ${name}

A Nyala Framework application.

## Getting Started

\`\`\`bash
npm install
npm run dev
\`\`\`

## Project Structure

- \`app/\` — your application code, one folder per artifact type (controllers, models, services, repositories, middleware, requests, resources, validators, policies, events, listeners, jobs, mail, notifications, exceptions, dto, enums, interfaces, contracts, helpers)
- \`config/\` — typed configuration, one file per concern
- \`database/\` — migrations, seeders, factories
- \`routes/\` — reserved for file-based route tables
- \`bootstrap/\` — application composition root (\`app.module.ts\`) and entry point (\`main.ts\`)
- \`storage/\`, \`public/\`, \`resources/\`, \`tests/\`, \`docs/\`, \`plugins/\`, \`framework/\` — see project README sections as each subsystem lands

Generate new artifacts with the CLI, e.g.:

\`\`\`bash
nyala generate controller User
nyala generate service User
nyala generate middleware Auth
\`\`\`

## Documentation

Visit [Nyala Documentation](https://nyalajs.dev) for more information.
`;
  }
}

import * as fs from "fs-extra";
import * as path from "path";
import chalk from "chalk";
import ora from "ora";
import { toPascalCase, toKebabCase } from "../utils/naming";

interface ArtifactSpec {
    label: string;
    folder: string;
    suffix: string;
    template: (className: string, name: string) => string;
}

/**
 * Generators for the artifact types listed in docs/requirements.md §4.23 /
 * the source SRS §7 "Code Generation". Every generator writes into the
 * app/<type> convention scaffolded by `nyala new` (see new.command.ts).
 *
 * Names may be passed with or without the conventional suffix — both
 * `nyala generate policy User` and `nyala generate policy UserPolicy`
 * produce `app/policies/user.policy.ts` exporting `UserPolicy`.
 *
 * Some artifact types (model, migration, repository, request, event,
 * listener, job, plugin) depend on framework subsystems that don't exist
 * yet (ORM, validation engine, event bus, queue, plugin loader — see
 * docs/requirements.md §4.6/§4.8-4.10/§4.14-16/§5). Those generators still
 * write a real file in the right place so the CLI surface matches the SRS,
 * but the template is a clearly-marked stub rather than working code.
 */
export class GenerateCommand {
    async generateController(name: string): Promise<void> {
        await this.generateAndRegister(name, this.specs.controller, "controllers");
    }

    async generateService(name: string): Promise<void> {
        await this.generateAndRegister(name, this.specs.service, "providers");
    }

    async generateModel(name: string): Promise<void> {
        await this.writeArtifact(name, this.specs.model);
    }

    async generateMigration(name: string): Promise<void> {
        const spinner = ora(`Generating migration: ${name}`).start();
        try {
            const fileName = `${this.timestamp()}_${toKebabCase(name)}`;
            const migrationPath = path.join(process.cwd(), "database/migrations", `${fileName}.ts`);

            await fs.ensureDir(path.dirname(migrationPath));
            await fs.writeFile(migrationPath, this.getMigrationTemplate(name));

            spinner.succeed(`Successfully generated migration: ${name}`);
            console.log(chalk.green(`\nCreated file:`));
            console.log(chalk.cyan(`  database/migrations/${fileName}.ts`));
        } catch (error) {
            spinner.fail("Failed to generate migration");
            console.error(error);
        }
    }

    async generateRepository(name: string): Promise<void> {
        await this.writeArtifact(name, this.specs.repository);
    }

    async generateRequest(name: string): Promise<void> {
        await this.writeArtifact(name, this.specs.request);
    }

    async generatePolicy(name: string): Promise<void> {
        await this.writeArtifact(name, this.specs.policy);
    }

    async generateMiddleware(name: string): Promise<void> {
        await this.writeArtifact(name, this.specs.middleware);
    }

    async generateEvent(name: string): Promise<void> {
        await this.writeArtifact(name, this.specs.event);
    }

    async generateListener(name: string): Promise<void> {
        await this.writeArtifact(name, this.specs.listener);
    }

    async generateJob(name: string): Promise<void> {
        await this.writeArtifact(name, this.specs.job);
    }

    async generateResource(name: string): Promise<void> {
        await this.writeArtifact(name, this.specs.resource);
    }

    async generateSeeder(name: string): Promise<void> {
        await this.writeArtifact(name, this.specs.seeder);
    }

    async generateFactory(name: string): Promise<void> {
        await this.writeArtifact(name, this.specs.factory);
    }

    async generateDto(name: string): Promise<void> {
        await this.writeArtifact(name, this.specs.dto);
    }

    async generatePlugin(name: string): Promise<void> {
        const spinner = ora(`Generating plugin: ${name}`).start();
        try {
            const fileName = toKebabCase(name);
            const pluginDir = path.join(process.cwd(), "plugins", fileName);

            if (await fs.pathExists(pluginDir)) {
                spinner.fail(`Plugin ${name} already exists`);
                return;
            }

            await fs.ensureDir(pluginDir);
            await fs.writeFile(path.join(pluginDir, "index.ts"), this.getPluginTemplate(name));

            spinner.succeed(`Successfully generated plugin: ${name}`);
            console.log(chalk.green(`\nCreated file:`));
            console.log(chalk.cyan(`  plugins/${fileName}/index.ts`));
        } catch (error) {
            spinner.fail("Failed to generate plugin");
            console.error(error);
        }
    }

    // --- artifact specs --------------------------------------------------

    private specs: Record<string, ArtifactSpec> = {
        controller: {
            label: "controller",
            folder: "controllers",
            suffix: "Controller",
            template: (className, name) => this.getControllerTemplate(className, toKebabCase(name)),
        },
        service: {
            label: "service",
            folder: "services",
            suffix: "Service",
            template: (className) => this.getServiceTemplate(className),
        },
        model: {
            label: "model",
            folder: "models",
            suffix: "",
            template: (className) => this.getModelTemplate(className),
        },
        repository: {
            label: "repository",
            folder: "repositories",
            suffix: "Repository",
            template: (className) => this.getRepositoryTemplate(className),
        },
        request: {
            label: "request",
            folder: "requests",
            suffix: "Request",
            template: (className) => this.getRequestTemplate(className),
        },
        policy: {
            label: "policy",
            folder: "policies",
            suffix: "Policy",
            template: (className, name) => this.getPolicyTemplate(className, name),
        },
        middleware: {
            label: "middleware",
            folder: "middleware",
            suffix: "Middleware",
            template: (className, name) => this.getMiddlewareTemplate(className, name),
        },
        event: {
            label: "event",
            folder: "events",
            suffix: "Event",
            template: (className) => this.getEventTemplate(className),
        },
        listener: {
            label: "listener",
            folder: "listeners",
            suffix: "Listener",
            template: (className) => this.getListenerTemplate(className),
        },
        job: {
            label: "job",
            folder: "jobs",
            suffix: "Job",
            template: (className, name) => this.getJobTemplate(className, name),
        },
        resource: {
            label: "resource",
            folder: "resources",
            suffix: "Resource",
            template: (className) => this.getResourceTemplate(className),
        },
        seeder: {
            label: "seeder",
            folder: "../../database/seeders",
            suffix: "Seeder",
            template: (className) => this.getSeederTemplate(className),
        },
        factory: {
            label: "factory",
            folder: "../../database/factories",
            suffix: "Factory",
            template: (className, name) => this.getFactoryTemplate(className, name),
        },
        dto: {
            label: "dto",
            folder: "dto",
            suffix: "Dto",
            template: (className) => this.getDtoTemplate(className),
        },
    };

    // --- naming ------------------------------------------------------

    /**
     * Strips a conventional suffix if the caller already included it, so
     * `policy User` and `policy UserPolicy` both yield `UserPolicy` / `user`
     * instead of stuttering to `UserPolicyPolicy`.
     */
    private normalizeName(name: string, suffix: string): { className: string; fileName: string } {
        const pascal = toPascalCase(name);
        const base = suffix && pascal.endsWith(suffix) ? pascal.slice(0, -suffix.length) : pascal;
        return {
            className: `${base}${suffix}`,
            fileName: toKebabCase(base),
        };
    }

    // --- shared write paths -----------------------------------------------

    private async writeArtifact(name: string, spec: ArtifactSpec): Promise<void> {
        const spinner = ora(`Generating ${spec.label}: ${name}`).start();
        try {
            const { className, fileName } = this.normalizeName(name, spec.suffix);
            const artifactPath = path.join(process.cwd(), "app", spec.folder, `${fileName}.${spec.label}.ts`);

            await fs.ensureDir(path.dirname(artifactPath));
            await fs.writeFile(artifactPath, spec.template(className, fileName));

            spinner.succeed(`Successfully generated ${spec.label}: ${name}`);
            console.log(chalk.green(`\nCreated file:`));
            console.log(chalk.cyan(`  app/${spec.folder}/${fileName}.${spec.label}.ts`));
        } catch (error) {
            spinner.fail(`Failed to generate ${spec.label}`);
            console.error(error);
        }
    }

    private async generateAndRegister(
        name: string,
        spec: ArtifactSpec,
        moduleArrayKey: "controllers" | "providers"
    ): Promise<void> {
        const spinner = ora(`Generating ${spec.label}: ${name}`).start();
        try {
            const { className, fileName } = this.normalizeName(name, spec.suffix);
            const artifactPath = path.join(process.cwd(), "app", spec.folder, `${fileName}.${spec.label}.ts`);

            await fs.ensureDir(path.dirname(artifactPath));
            await fs.writeFile(artifactPath, spec.template(className, fileName));

            await this.registerInAppModule(moduleArrayKey, className, `../app/${spec.folder}/${fileName}.${spec.label}`);

            spinner.succeed(`Successfully generated ${spec.label}: ${name}`);
            console.log(chalk.green(`\nCreated file:`));
            console.log(chalk.cyan(`  app/${spec.folder}/${fileName}.${spec.label}.ts`));
        } catch (error) {
            spinner.fail(`Failed to generate ${spec.label}`);
            console.error(error);
        }
    }

    /** Best-effort: appends the import + array entry to bootstrap/app.module.ts. */
    private async registerInAppModule(
        arrayKey: "controllers" | "providers",
        className: string,
        importPath: string
    ): Promise<void> {
        const modulePath = path.join(process.cwd(), "bootstrap/app.module.ts");

        if (!(await fs.pathExists(modulePath))) {
            return;
        }

        let content = await fs.readFile(modulePath, "utf-8");
        const importStatement = `import { ${className} } from "${importPath}";`;

        if (!content.includes(importStatement)) {
            const importBlock = /(^import .*\n)+/m;
            content = importBlock.test(content)
                ? content.replace(importBlock, (match) => `${match}${importStatement}\n`)
                : `${importStatement}\n${content}`;
        }

        const arrayRegex = new RegExp(`(${arrayKey}:\\s*\\[)([^\\]]*)(\\])`);
        content = content.replace(arrayRegex, (_match, open, inner, close) => {
            const items = inner
                .split(",")
                .map((item: string) => item.trim())
                .filter(Boolean);

            if (!items.includes(className)) {
                items.push(className);
            }

            return `${open}${items.join(", ")}${close}`;
        });

        await fs.writeFile(modulePath, content);
    }

    private timestamp(): string {
        const now = new Date();
        const pad = (n: number) => String(n).padStart(2, "0");
        return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    }

    // --- templates -------------------------------------------------------

    private getControllerTemplate(className: string, fileName: string): string {
        return `import { Controller, Get, Post } from "@nyala/core";

@Controller("/${fileName}")
export class ${className} {
  @Get("/")
  findAll() {
    return { message: "This action returns all ${fileName}" };
  }

  @Post("/")
  create() {
    return { message: "This action creates a new ${fileName}" };
  }
}
`;
    }

    private getServiceTemplate(className: string): string {
        return `import { Injectable } from "@nyala/core";

@Injectable()
export class ${className} {
  // Add your business logic here
}
`;
    }

    private getModelTemplate(className: string): string {
        return `import { Model, Table, Primary, StringColumn, TimestampColumn } from "@nyala/database";

@Table("${toKebabCase(className)}s")
export class ${className} extends Model {
  @Primary()
  @StringColumn()
  id!: string;

  @TimestampColumn()
  createdAt!: Date;

  @TimestampColumn()
  updatedAt!: Date;
}
`;
    }

    private getMigrationTemplate(name: string): string {
        return `import { sql } from "drizzle-orm";

export async function up(db: any): Promise<void> {
  // TODO: implement migration for ${name}
  // await db.execute(sql\`CREATE TABLE ...\`);
}

export async function down(db: any): Promise<void> {
  // TODO: reverse migration for ${name}
}
`;
    }

    private getRepositoryTemplate(className: string): string {
        return `import { Injectable } from "@nyala/core";
import { DatabaseService } from "@nyala/database";

@Injectable()
export class ${className} {
  constructor(private readonly dbService: DatabaseService) {}

  async findAll() {
    // const db = this.dbService.getDb();
    // return await db.select().from(tableName);
  }

  async findById(id: string | number) {
    // ...
  }
}
`;
    }

    private getRequestTemplate(className: string): string {
        return `import { z } from "zod";
import { ApiProperty } from "@nyala/http";

export const ${className}Schema = z.object({
  // TODO: Define validation rules
  // email: z.string().email(),
});

export class ${className} {
  // @ApiProperty({ description: "Example property", type: "string" })
  // public propertyName!: string;
}
`;
    }

    private getPolicyTemplate(className: string, name: string): string {
        return `import { Injectable } from "@nyala/core";
import { Guard, ExecutionContext, ForbiddenException } from "@nyala/http";

@Injectable()
export class ${className} implements Guard {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const user = context.context.metadata.get("user");

    if (!user) {
      throw new ForbiddenException("Not authorized");
    }

    // TODO: implement the authorization rule for ${name}
    return true;
  }
}
`;
    }

    private getMiddlewareTemplate(className: string, name: string): string {
        return `import { Injectable } from "@nyala/core";
import { ExecutionContext } from "@nyala/http";

@Injectable()
export class ${className} {
  async use(ctx: ExecutionContext, next: () => Promise<void>): Promise<void> {
    // TODO: implement ${name} middleware logic
    await next();
  }
}
`;
    }

    private getEventTemplate(className: string): string {
        return `export class ${className} {
  constructor(public readonly payload: Record<string, unknown> = {}) {}
}
`;
    }

    private getListenerTemplate(className: string): string {
        return `import { Injectable } from "@nyala/core";
import { EventHandler } from "@nyala/events";

@Injectable()
export class ${className} {
  @EventHandler("example.event")
  async handle(event: unknown): Promise<void> {
    // TODO: react to the event
  }
}
`;
    }

    private getJobTemplate(className: string, name: string): string {
        return `import { Process } from "@nyala/queue";
import type { Job } from "bullmq";

export class ${className} {
  /**
   * Handle the queued job.
   * Dispatch with: dispatch("${name}", "${className}", { ...payload })
   */
  @Process("${name}")
  async handle(job: Job): Promise<void> {
    const data = job.data;
    // TODO: implement background work for ${name}
    console.log("[${className}] Processing job", data);
  }
}
`;
    }

    private getResourceTemplate(className: string): string {
        return `// A resource shapes a model/entity into the JSON your API returns.
// Wire it into a controller manually, e.g.:
//   return ${className}.collection(items);
export class ${className} {
  static make(item: any) {
    return {
      // TODO: pick the fields to expose
      id: item.id,
    };
  }

  static collection(items: any[]) {
    return items.map((item) => ${className}.make(item));
  }
}
`;
    }

    private getPluginTemplate(name: string): string {
        const className = toPascalCase(name) + "Plugin";
        return `import { NyalaPlugin, NyalaApplication } from "@nyala/core";

export default class ${className} implements NyalaPlugin {
  name = "${name}";

  /**
   * Called once during application boot (before HTTP server starts).
   * Register services, routes, or middleware here.
   */
  async register(app: NyalaApplication): Promise<void> {
    // TODO: register plugin services
    // app.get(SomeService).configure({...});
    console.log("[${name}] Plugin registered.");
  }

  /**
   * Called after all plugins are registered.
   * Safe to depend on other plugins here.
   */
  async boot(app: NyalaApplication): Promise<void> {
    // TODO: run post-registration startup logic
  }
}
`;
    }

    private getSeederTemplate(className: string): string {
        return `import { Seeder } from "@nyala/database";
import { NodePgDatabase } from "drizzle-orm/node-postgres";

export default class ${className} extends Seeder {
    /**
     * Run the database seeds.
     */
    async run(db: NodePgDatabase): Promise<void> {
        // TODO: insert seed data
        // await db.insert(users).values({ ... });
    }
}
`;
    }

    private getFactoryTemplate(className: string, name: string): string {
        const modelName = toPascalCase(name);
        return `import { Factory } from "@nyala/database";
// import { ${modelName} } from "../../app/models/${toKebabCase(name)}";

export class ${className} extends Factory<any /* ${modelName} */> {
    model = Object as any; // TODO: replace with ${modelName}

    /**
     * Define the model's default state.
     */
    definition(): any /* Partial<${modelName}> */ {
        return {
            // TODO: define default attributes
        };
    }
}
`;
    }

    private getDtoTemplate(className: string): string {
        return `export class ${className} {
    // TODO: Define your data transfer object properties
}
`;
    }
}

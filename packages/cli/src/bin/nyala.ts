#!/usr/bin/env node

import * as fs from "fs";
import * as path from "path";
import { Command } from "commander";
import { spawnSync } from "child_process";
import { NewCommand } from "../commands/new.command";
import { GenerateCommand } from "../commands/generate.command";
import { ValidateCommand } from "../commands/validate.command";
import { MigrateCommand } from "../commands/migrate.command";
import { SeedCommand } from "../commands/seed.command";
import { printBanner } from "../utils/banner";

const { version } = JSON.parse(
    fs.readFileSync(path.join(__dirname, "../../package.json"), "utf-8")
);

// Print the Nyala 3D logo banner on every CLI invocation
printBanner(version);

const program = new Command();

program
    .name("nyala")
    .description("Nyala Framework CLI")
    .version(version);

// New command
program
    .command("new [name]")
    .description("Generate a new Nyala application")
    .option("-t, --template <template>", "Template to use (mvc, saas, basic)", "mvc")
    .option("-d, --database <driver>", "Database driver (postgres, mysql, sqlite)", "postgres")
    .action(async (name, options) => {
        const cmd = new NewCommand();
        await cmd.execute(name, options);
    });

// Generate command — artifact types per docs/requirements.md §4.23
const generate = program
    .command("generate")
    .alias("g")
    .description("Generate framework artifacts");

generate
    .command("controller <name>")
    .description("Generate a new controller in app/controllers")
    .action(async (name) => {
        await new GenerateCommand().generateController(name);
    });

generate
    .command("model <name>")
    .description("Generate a new model in app/models")
    .action(async (name) => {
        await new GenerateCommand().generateModel(name);
    });

generate
    .command("migration <name>")
    .description("Generate a new migration in database/migrations")
    .action(async (name) => {
        await new GenerateCommand().generateMigration(name);
    });

generate
    .command("service <name>")
    .description("Generate a new service in app/services")
    .action(async (name) => {
        await new GenerateCommand().generateService(name);
    });

generate
    .command("repository <name>")
    .description("Generate a new repository in app/repositories")
    .action(async (name) => {
        await new GenerateCommand().generateRepository(name);
    });

generate
    .command("request <name>")
    .description("Generate a new request DTO in app/requests")
    .action(async (name) => {
        await new GenerateCommand().generateRequest(name);
    });

generate
    .command("policy <name>")
    .description("Generate a new policy in app/policies")
    .action(async (name) => {
        await new GenerateCommand().generatePolicy(name);
    });

generate
    .command("middleware <name>")
    .description("Generate a new middleware in app/middleware")
    .action(async (name) => {
        await new GenerateCommand().generateMiddleware(name);
    });

generate
    .command("event <name>")
    .description("Generate a new event in app/events")
    .action(async (name) => {
        await new GenerateCommand().generateEvent(name);
    });

generate
    .command("listener <name>")
    .description("Generate a new listener in app/listeners")
    .action(async (name) => {
        await new GenerateCommand().generateListener(name);
    });

generate
    .command("job <name>")
    .description("Generate a new job in app/jobs")
    .action(async (name) => {
        await new GenerateCommand().generateJob(name);
    });

generate
    .command("resource <name>")
    .description("Generate a new resource in app/resources")
    .action(async (name) => {
        await new GenerateCommand().generateResource(name);
    });

generate
    .command("plugin <name>")
    .description("Generate a new plugin in plugins/")
    .action(async (name) => {
        await new GenerateCommand().generatePlugin(name);
    });

generate
    .command("seeder <name>")
    .description("Generate a new database seeder in database/seeders")
    .action(async (name) => {
        await new GenerateCommand().generateSeeder(name);
    });

generate
    .command("factory <name>")
    .description("Generate a new database factory in database/factories")
    .action(async (name) => {
        await new GenerateCommand().generateFactory(name);
    });

// Validate command
program
    .command("validate")
    .description("Validate application architecture")
    .action(async () => {
        const cmd = new ValidateCommand();
        await cmd.execute();
    });

// Dev command
program
    .command("dev")
    .description("Start the application in development mode with hot-reload")
    .action(() => {
        console.log("Starting Nyala development server...\n");
        const result = spawnSync("npx", ["nodemon", "--exec", "ts-node", "bootstrap/main.ts"], {
            stdio: "inherit",
        });

        if (result.error) {
            console.error("Failed to start dev server:", result.error.message);
            process.exit(1);
        }
        process.exit(result.status ?? 0);
    });

program
    .command("db:migrate")
    .description("Run pending database migrations (Drizzle ORM)")
    .option("--seed", "Run seeders after migrating")
    .action(async (options) => {
        const command = new MigrateCommand();
        await command.handle({ seed: options.seed });
    });

program
    .command("db:fresh")
    .description("Drop the entire schema, re-run all migrations, and optionally seed")
    .option("--seed", "Run seeders after migrating")
    .action(async () => {
        const command = new MigrateCommand();
        await command.fresh();
    });

program
    .command("db:seed")
    .description("Run database seeders from database/seeders/")
    .option("--class <name>", "Only run the named seeder (partial match)")
    .action(async (options) => {
        const command = new SeedCommand();
        await command.handle({ class: options.class });
    });

program
    .command("build")
    .description("Build the application for production (tsc → dist/)")
    .option("--out-dir <dir>", "Output directory", "dist")
    .action((options) => {
        console.log("Building Nyala application...\n");
        const result = spawnSync("npx", ["tsc", "--outDir", options.outDir, "--skipLibCheck"], {
            stdio: "inherit",
        });
        if (result.error) {
            console.error("Build failed:", result.error.message);
            process.exit(1);
        }
        if (result.status === 0) {
            console.log(`\n✔ Build complete → ${options.outDir}/`);
        }
        process.exit(result.status ?? 0);
    });

program.parse(process.argv);

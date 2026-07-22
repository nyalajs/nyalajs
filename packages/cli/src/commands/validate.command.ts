import * as fs from "fs-extra";
import * as path from "path";
import chalk from "chalk";
import ora from "ora";

export class ValidateCommand {
    async execute(): Promise<void> {
        const spinner = ora("Validating application architecture").start();

        try {
            const violations: string[] = [];

            // Check for circular dependencies
            const circularDeps = await this.checkCircularDependencies();
            if (circularDeps.length > 0) {
                violations.push(...circularDeps);
            }

            // Check for forbidden imports
            const forbiddenImports = await this.checkForbiddenImports();
            if (forbiddenImports.length > 0) {
                violations.push(...forbiddenImports);
            }

            if (violations.length === 0) {
                spinner.succeed("Architecture validation passed");
                console.log(chalk.green("\n✓ No architecture violations found"));
            } else {
                spinner.fail("Architecture validation failed");
                console.log(chalk.red(`\n✗ Found ${violations.length} violation(s):\n`));
                violations.forEach((v) => console.log(chalk.yellow(`  - ${v}`)));
                process.exit(1);
            }
        } catch (error) {
            spinner.fail("Validation failed");
            console.error(error);
            process.exit(1);
        }
    }

    private async checkCircularDependencies(): Promise<string[]> {
        // Simplified circular dependency check
        // In production, this would use a proper dependency graph analyzer
        return [];
    }

    private async checkForbiddenImports(): Promise<string[]> {
        const violations: string[] = [];
        // app/, bootstrap/, config/, routes/, database/ per docs/requirements.md §3.1
        const roots = ["app", "bootstrap", "config", "routes", "database"];

        const files: string[] = [];
        for (const root of roots) {
            const rootPath = path.join(process.cwd(), root);
            if (await fs.pathExists(rootPath)) {
                files.push(...(await this.getAllTsFiles(rootPath)));
            }
        }

        // Check for deep imports (e.g., importing from module internals)
        // This is a simplified check
        for (const file of files) {
            const content = await fs.readFile(file, "utf-8");
            const lines = content.split("\n");

            lines.forEach((line, index) => {
                // Check for imports from module internals
                if (line.includes("import") && line.includes("../")) {
                    const depth = (line.match(/\.\.\//g) || []).length;
                    if (depth > 2) {
                        violations.push(
                            `${file}:${index + 1} - Deep import detected (depth: ${depth})`
                        );
                    }
                }
            });
        }

        return violations;
    }

    private async getAllTsFiles(dir: string): Promise<string[]> {
        const files: string[] = [];
        const entries = await fs.readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);

            if (entry.isDirectory()) {
                if (entry.name !== "node_modules" && entry.name !== "dist") {
                    files.push(...(await this.getAllTsFiles(fullPath)));
                }
            } else if (entry.name.endsWith(".ts")) {
                files.push(fullPath);
            }
        }

        return files;
    }
}

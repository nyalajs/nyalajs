import * as fs from "fs-extra";
import * as path from "path";
import chalk from "chalk";
import ora from "ora";

export class ValidateCommand {
    constructor(private readonly cwd: string = process.cwd()) {}

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
        const roots = ["app", "bootstrap", "config", "routes", "database"];

        const files: string[] = [];
        for (const root of roots) {
            const rootPath = path.join(this.cwd, root);
            if (await fs.pathExists(rootPath)) {
                files.push(...(await this.getAllTsFiles(rootPath)));
            }
        }

        const graph = new Map<string, string[]>();
        for (const file of files) {
            graph.set(file, await this.getLocalImports(file));
        }

        return this.findCycles(graph).map(
            (cycle) => `Circular dependency: ${cycle.map((f) => path.relative(this.cwd, f)).join(" -> ")}`
        );
    }

    /** Resolves a file's relative import/require specifiers to real file paths, skipping package imports. */
    private async getLocalImports(file: string): Promise<string[]> {
        const content = await fs.readFile(file, "utf-8");
        const dir = path.dirname(file);
        const specifiers = new Set<string>();

        // Matches `import ... from "spec"` / `export ... from "spec"` / `require("spec")`.
        const specifierPattern = /(?:import|export)[^'";]*?\bfrom\s*['"]([^'"]+)['"]|require\(\s*['"]([^'"]+)['"]\s*\)/g;
        let match: RegExpExecArray | null;
        while ((match = specifierPattern.exec(content)) !== null) {
            const specifier = match[1] ?? match[2];
            if (specifier && (specifier.startsWith("./") || specifier.startsWith("../"))) {
                specifiers.add(specifier);
            }
        }

        const resolved: string[] = [];
        for (const specifier of specifiers) {
            const resolvedPath = await this.resolveLocalImport(dir, specifier);
            if (resolvedPath) resolved.push(resolvedPath);
        }
        return resolved;
    }

    private async resolveLocalImport(dir: string, specifier: string): Promise<string | null> {
        const base = path.resolve(dir, specifier);
        for (const candidate of [`${base}.ts`, path.join(base, "index.ts")]) {
            if (await fs.pathExists(candidate)) return candidate;
        }
        return null;
    }

    /**
     * Depth-first cycle detection over the local-import graph (classic
     * white/gray/black DFS). Only enumerates each cycle once, from whichever
     * node in it is visited first, and reports it as the concrete file path
     * that closes the loop.
     */
    private findCycles(graph: Map<string, string[]>): string[][] {
        const state = new Map<string, "visiting" | "done">();
        const stack: string[] = [];
        const cycles: string[][] = [];
        const seen = new Set<string>();

        const visit = (node: string) => {
            state.set(node, "visiting");
            stack.push(node);

            for (const dependency of graph.get(node) ?? []) {
                const depState = state.get(dependency);
                if (depState === "visiting") {
                    const start = stack.indexOf(dependency);
                    const cycle = [...stack.slice(start), dependency];
                    const key = [...new Set(cycle)].sort().join("|");
                    if (!seen.has(key)) {
                        seen.add(key);
                        cycles.push(cycle);
                    }
                } else if (depState !== "done" && graph.has(dependency)) {
                    visit(dependency);
                }
            }

            stack.pop();
            state.set(node, "done");
        };

        for (const node of graph.keys()) {
            if (!state.has(node)) visit(node);
        }

        return cycles;
    }

    private async checkForbiddenImports(): Promise<string[]> {
        const violations: string[] = [];
        // app/, bootstrap/, config/, routes/, database/ per docs/requirements.md §3.1
        const roots = ["app", "bootstrap", "config", "routes", "database"];

        const files: string[] = [];
        for (const root of roots) {
            const rootPath = path.join(this.cwd, root);
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

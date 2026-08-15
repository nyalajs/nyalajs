import * as fs from "fs-extra";
import * as path from "path";

export interface DoctorCheckResult {
    name: string;
    status: "pass" | "warn" | "fail";
    message: string;
}

export interface DoctorCheck {
    name: string;
    run(cwd: string): Promise<DoctorCheckResult>;
}

async function readProjectDeps(cwd: string): Promise<Record<string, string> | null> {
    const pkgPath = path.join(cwd, "package.json");
    if (!(await fs.pathExists(pkgPath))) return null;
    const pkg = await fs.readJson(pkgPath);
    return { ...pkg.dependencies, ...pkg.devDependencies };
}

/**
 * Catches the exact class of bug found (and fixed) in this framework's own
 * saas-starter template: @nyalajs/tenancy installed, but TenantMiddleware
 * never actually registered — which doesn't silently leak data (Model and
 * BaseRepository both fail closed with no active tenant), but does mean
 * every tenant-aware request throws "Tenant context required" instead of
 * working, because nothing ever resolved a tenant in the first place.
 */
export const tenancyMiddlewareCheck: DoctorCheck = {
    name: "tenancy-middleware",
    async run(cwd) {
        const deps = await readProjectDeps(cwd);
        if (!deps) return { name: "tenancy-middleware", status: "pass", message: "No package.json found — skipped." };
        if (!deps["@nyalajs/tenancy"]) {
            return { name: "tenancy-middleware", status: "pass", message: "@nyalajs/tenancy is not a dependency — skipped." };
        }

        const middlewareConfigPath = path.join(cwd, "config/middleware.ts");
        const appModulePath = path.join(cwd, "bootstrap/app.module.ts");

        const middlewareSource = (await fs.pathExists(middlewareConfigPath))
            ? await fs.readFile(middlewareConfigPath, "utf-8")
            : "";
        const appModuleSource = (await fs.pathExists(appModulePath)) ? await fs.readFile(appModulePath, "utf-8") : "";

        const wiredInConfig = /TenantMiddleware/.test(middlewareSource);
        const registeredAsProvider = /TenantMiddleware/.test(appModuleSource);

        if (wiredInConfig && registeredAsProvider) {
            return {
                name: "tenancy-middleware",
                status: "pass",
                message: "TenantMiddleware is registered in both config/middleware.ts and bootstrap/app.module.ts.",
            };
        }

        return {
            name: "tenancy-middleware",
            status: "fail",
            message:
                `@nyalajs/tenancy is installed but TenantMiddleware isn't fully wired ` +
                `(config/middleware.ts global array: ${wiredInConfig ? "yes" : "MISSING"}, ` +
                `bootstrap/app.module.ts providers: ${registeredAsProvider ? "yes" : "MISSING"}). ` +
                `Every request will have no active tenant, so any tenant-aware Model or ` +
                `BaseRepository call will throw "Tenant context required" — this fails closed, not open, ` +
                `but it means the app is broken, not just insecure.`,
        };
    },
};

const DATABASE_DRIVER_PACKAGES: Record<string, string> = {
    pg: "pg",
    postgres: "postgres",
    mysql2: "mysql2",
    "better-sqlite3": "better-sqlite3",
};

/** Catches a config/database.ts driver setting whose npm package was never actually installed. */
export const databaseDriverCheck: DoctorCheck = {
    name: "database-driver-installed",
    async run(cwd) {
        const deps = await readProjectDeps(cwd);
        if (!deps) return { name: "database-driver-installed", status: "pass", message: "No package.json found — skipped." };
        if (!deps["@nyalajs/database"]) {
            return { name: "database-driver-installed", status: "pass", message: "@nyalajs/database is not a dependency — skipped." };
        }

        const configPath = path.join(cwd, "config/database.ts");
        if (!(await fs.pathExists(configPath))) {
            return { name: "database-driver-installed", status: "pass", message: "No config/database.ts found — skipped." };
        }

        const source = await fs.readFile(configPath, "utf-8");
        const match = source.match(/driver\s*:\s*["']([\w-]+)["']/);
        if (!match) {
            return { name: "database-driver-installed", status: "pass", message: "No explicit `driver` setting found — skipped." };
        }

        const driver = match[1];
        const packageName = DATABASE_DRIVER_PACKAGES[driver];
        if (!packageName) {
            return {
                name: "database-driver-installed",
                status: "warn",
                message: `config/database.ts configures an unrecognized driver "${driver}".`,
            };
        }

        if (deps[packageName]) {
            return {
                name: "database-driver-installed",
                status: "pass",
                message: `Driver "${driver}" is configured and "${packageName}" is installed.`,
            };
        }

        return {
            name: "database-driver-installed",
            status: "fail",
            message: `config/database.ts configures driver "${driver}" but "${packageName}" isn't installed. Run: npm install ${packageName}`,
        };
    },
};

/**
 * A minimum @nyalajs/core version below which some behavior this check
 * cares about is known broken. Keyed by the check's own name so a future
 * check can add another entry without touching this one.
 */
const GUARDS_FIXED_IN_CORE_VERSION = "2.0.1";

function compareSemver(a: string, b: string): number {
    const pa = a.split(".").map(Number);
    const pb = b.split(".").map(Number);
    for (let i = 0; i < 3; i++) {
        const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
        if (diff !== 0) return diff;
    }
    return 0;
}

/**
 * Catches an app using @UseGuards()/@UseInterceptors() while running an
 * @nyalajs/core version where RouteResolver never actually read that
 * metadata — meaning every "protected" route was reachable with no guard
 * check at all. Fixed in @nyalajs/core@2.0.1. This can't be caught by
 * asking "is @nyalajs/tenancy installed" the way tenancyMiddlewareCheck
 * does, because the bug lived in @nyalajs/core itself and affected
 * @UseGuards() regardless of which guard class an app supplies.
 */
export const guardsWiredCheck: DoctorCheck = {
    name: "guards-and-interceptors-wired",
    async run(cwd) {
        const appSourceDirs = ["app", "src"];
        let usesGuardsOrInterceptors = false;
        for (const dir of appSourceDirs) {
            const dirPath = path.join(cwd, dir);
            if (!(await fs.pathExists(dirPath))) continue;
            const files = await fs.readdir(dirPath, { recursive: true } as any);
            for (const file of files as string[]) {
                if (!file.endsWith(".ts") && !file.endsWith(".tsx")) continue;
                const source = await fs.readFile(path.join(dirPath, file), "utf-8").catch(() => "");
                if (/@UseGuards\(|@UseInterceptors\(/.test(source)) {
                    usesGuardsOrInterceptors = true;
                    break;
                }
            }
            if (usesGuardsOrInterceptors) break;
        }

        if (!usesGuardsOrInterceptors) {
            return {
                name: "guards-and-interceptors-wired",
                status: "pass",
                message: "No @UseGuards()/@UseInterceptors() usage found — skipped.",
            };
        }

        let installedVersion: string | undefined;
        try {
            const corePkgPath = require.resolve("@nyalajs/core/package.json", { paths: [cwd] });
            installedVersion = (await fs.readJson(corePkgPath)).version;
        } catch {
            // @nyalajs/core not resolvable from cwd — can't check its version.
        }

        if (!installedVersion) {
            return {
                name: "guards-and-interceptors-wired",
                status: "warn",
                message:
                    "Uses @UseGuards()/@UseInterceptors() but couldn't resolve the installed @nyalajs/core " +
                    "version to confirm it's new enough. Run `npm install` first.",
            };
        }

        if (compareSemver(installedVersion, GUARDS_FIXED_IN_CORE_VERSION) < 0) {
            return {
                name: "guards-and-interceptors-wired",
                status: "fail",
                message:
                    `Uses @UseGuards()/@UseInterceptors(), but the installed @nyalajs/core@${installedVersion} ` +
                    `has a bug where RouteResolver never reads that metadata — every "protected" route runs ` +
                    `with NO guards at all, regardless of what's declared. Fixed in @nyalajs/core@${GUARDS_FIXED_IN_CORE_VERSION}. ` +
                    `Run: npm install @nyalajs/core@latest`,
            };
        }

        return {
            name: "guards-and-interceptors-wired",
            status: "pass",
            message: `@nyalajs/core@${installedVersion} correctly wires @UseGuards()/@UseInterceptors().`,
        };
    },
};

/**
 * Finds every `providers: [ ... ]` array in `source` and returns the raw
 * text inside each one. Tracks bracket depth character-by-character rather
 * than using a regex like `\[([\s\S]*?)\]` — real provider arrays commonly
 * contain their own nested `[`/`]` (e.g. `useFactory: () => { for (const
 * [a, b] of entries) { ... } }`), which stops a non-greedy regex at the
 * FIRST inner `]` instead of the array's real closing bracket, silently
 * truncating the scan before reaching providers declared later in the
 * array — confirmed live against templates/cms-starter's real
 * app.module.ts (a `for (const [namespace, values] of ...)` inside one
 * factory truncated the match well before SessionAuthGuard/RolesGuard).
 */
function extractProvidersBlocks(source: string): string[] {
    const blocks: string[] = [];
    const startPattern = /providers\s*:\s*\[/g;
    let match: RegExpExecArray | null;

    while ((match = startPattern.exec(source)) !== null) {
        const contentStart = match.index + match[0].length;
        let depth = 1;
        let i = contentStart;
        while (i < source.length && depth > 0) {
            if (source[i] === "[") depth++;
            else if (source[i] === "]") depth--;
            i++;
        }
        // depth === 0 means we found the real matching close bracket;
        // depth > 0 at end-of-string means malformed/unclosed source — skip it.
        if (depth === 0) {
            blocks.push(source.slice(contentStart, i - 1));
        }
    }

    return blocks;
}

/**
 * Catches a class referenced by @UseGuards()/@UseInterceptors()/@UseFilters()
 * that was never added to bootstrap/app.module.ts's `providers` array — the
 * DI container throws "Provider not found" the first time a request
 * actually reaches that route, since RouteResolver resolves guards from the
 * container at request time, not at boot. Found live, more than once, in
 * this framework's own shipped templates/examples (SessionAuthGuard,
 * AuthGuard, RolesGuard each missing from one app or another) — this check
 * automates the exact manual audit that caught those.
 *
 * Deliberately conservative: only flags a class name that appears in NO
 * providers array anywhere in the project (not just app.module.ts, in case
 * a project splits providers across multiple files) — a class this check
 * can't find is reported as a warning to go check manually, not a hard
 * fail, since a false "fail" here is worse than a missed true positive
 * (this is regex-based, not a real TS/AST parse of the module graph).
 */
export const guardProvidersRegisteredCheck: DoctorCheck = {
    name: "guard-providers-registered",
    async run(cwd) {
        const appSourceDirs = ["app", "src"];
        const referencedClasses = new Map<string, string>(); // class name -> first file it was found in

        for (const dir of appSourceDirs) {
            const dirPath = path.join(cwd, dir);
            if (!(await fs.pathExists(dirPath))) continue;
            const files = (await fs.readdir(dirPath, { recursive: true } as any)) as string[];

            for (const file of files) {
                if (!file.endsWith(".ts") && !file.endsWith(".tsx")) continue;
                const filePath = path.join(dirPath, file);
                const source = await fs.readFile(filePath, "utf-8").catch(() => "");

                const decoratorCalls = source.matchAll(/@Use(?:Guards|Interceptors|Filters)\(([^)]*)\)/g);
                for (const call of decoratorCalls) {
                    const args = call[1];
                    // Class identifiers only — skips spread/property-access
                    // arguments (rare, but not this check's job to evaluate).
                    const classNames = args.match(/\b[A-Z][A-Za-z0-9_]*\b/g) ?? [];
                    for (const className of classNames) {
                        if (!referencedClasses.has(className)) {
                            referencedClasses.set(className, path.relative(cwd, filePath));
                        }
                    }
                }
            }
        }

        if (referencedClasses.size === 0) {
            return {
                name: "guard-providers-registered",
                status: "pass",
                message: "No @UseGuards()/@UseInterceptors()/@UseFilters() usage found — skipped.",
            };
        }

        // Search every .ts file under the project root (not just
        // bootstrap/app.module.ts) for `providers: [...]` blocks, in case a
        // project splits its module across multiple files — collect every
        // identifier that appears inside any such block, project-wide.
        const registeredNames = new Set<string>();
        const allFiles = (await fs.readdir(cwd, { recursive: true } as any).catch(() => [])) as string[];
        for (const file of allFiles) {
            if (!file.endsWith(".ts") || file.includes("node_modules") || file.includes(".drizzle-meta")) continue;
            const source = await fs.readFile(path.join(cwd, file), "utf-8").catch(() => "");
            for (const block of extractProvidersBlocks(source)) {
                const names = block.match(/\b[A-Z][A-Za-z0-9_]*\b/g) ?? [];
                for (const name of names) registeredNames.add(name);
            }
        }

        const missing: Array<{ className: string; file: string }> = [];
        for (const [className, file] of referencedClasses) {
            if (!registeredNames.has(className)) {
                missing.push({ className, file });
            }
        }

        if (missing.length === 0) {
            return {
                name: "guard-providers-registered",
                status: "pass",
                message: `Every class referenced by @UseGuards()/@UseInterceptors()/@UseFilters() (${referencedClasses.size} found) appears in a providers array.`,
            };
        }

        return {
            name: "guard-providers-registered",
            status: "warn",
            message:
                `${missing.length} class(es) referenced by @UseGuards()/@UseInterceptors()/@UseFilters() ` +
                `were not found in any providers array — if genuinely unregistered, every route using them ` +
                `will throw "Provider not found" at request time, not at boot: ` +
                missing.map((m) => `${m.className} (${m.file})`).join(", ") +
                `. This check is regex-based and can miss providers registered dynamically or split across ` +
                `files in an unusual way — verify manually before assuming this is a false positive.`,
        };
    },
};

const DEFAULT_CHECKS: DoctorCheck[] = [
    tenancyMiddlewareCheck,
    databaseDriverCheck,
    guardsWiredCheck,
    guardProvidersRegisteredCheck,
];

export class DoctorCommand {
    private readonly cwd: string;
    private readonly checks: DoctorCheck[];

    constructor(options: { cwd?: string; checks?: DoctorCheck[] } = {}) {
        this.cwd = options.cwd ?? process.cwd();
        this.checks = options.checks ?? DEFAULT_CHECKS;
    }

    async run(): Promise<DoctorCheckResult[]> {
        const results: DoctorCheckResult[] = [];
        for (const check of this.checks) {
            results.push(await check.run(this.cwd));
        }
        return results;
    }

    /** Prints results and returns whether every check passed (no "fail" results — "warn" doesn't count as failure). */
    async runAndPrint(): Promise<boolean> {
        const results = await this.run();
        let allPassed = true;

        for (const result of results) {
            const icon = result.status === "pass" ? "✓" : result.status === "warn" ? "⚠" : "✗";
            console.log(`${icon} ${result.name}: ${result.message}`);
            if (result.status === "fail") allPassed = false;
        }

        return allPassed;
    }
}

/**
 * Structured, authoritative facts about Nyala JS conventions — the single
 * source every AI feature (ask/explain/review/resolve) draws from instead
 * of each one carrying its own copy of "Nyala uses dependency injection..."
 * prose. When a convention changes, this is the one place to update.
 *
 * Deliberately does NOT try to re-derive things ProjectContextService
 * already gets right from the real, booted app (module graph, routes) —
 * this covers framework-level conventions that are true for every Nyala
 * project, not this-specific-project facts.
 *
 * Every fact here should be traceable to real framework source, not
 * assumed from what a similarly-named decorator does in another
 * framework — Nyala's DI container, module system, and CLI are hand-built
 * and diverge from Nest/Laravel in specific, easy-to-get-wrong ways (see
 * each section below for the concrete divergence).
 */
export class FrameworkKnowledge {
    getDependencyInjection(): string {
        return [
            "Nyala's DI container (@nyalajs/core Container) is hand-built, not a wrapper around InversifyJS/tsyringe/NestJS's own container.",
            "Constructor injection is by TYPE by default (reads TS's emitted design:paramtypes), not by decorator-declared token — `@Inject(token)` is only needed to override with an explicit token (e.g. a string token like \"REQUEST\").",
            "`@Injectable()` is a marker only — the container does NOT require it to construct a class; it's documentation, not a functional gate.",
            "Provider scopes: SINGLETON (default), REQUEST (one instance per request, resolved via a request-scoped child container created per HTTP request), TRANSIENT (never cached).",
            "There is no `@Module()`-per-feature convention enforced — providers/controllers are declared directly in `@Module({ providers, controllers, imports })`; nested feature modules are optional, not required.",
            "IMPORTANT: there is no `ServiceProvider` base class anywhere in this framework, despite that being the standard term in Laravel/Nest-adjacent naming. Don't suggest writing one.",
        ].join("\n");
    }

    getModuleStructure(): string {
        return [
            "A Nyala app's root module lives at bootstrap/app.module.ts, exporting a class decorated with @Module({ providers, controllers, exports }), and is bootstrapped from bootstrap/main.ts via `NyalaFactory.create(AppModule)`.",
            "Conventional folders: app/{controllers,services,repositories,models,dto,middleware,requests,policies,events,listeners,jobs} (not every app uses every folder), config/*.ts (one file per namespace, aggregated in config/index.ts), database/{migrations,seeders,factories}.",
            "`nyala generate <kind> <Name>` scaffolds a new file under the matching app/ subfolder and — for controllers and services only — automatically registers the class in bootstrap/app.module.ts's providers/controllers array.",
            "CLI commands (migrate, seed, build) never boot the DI container in-process — they either operate directly on the filesystem or shell out to a `runtime/*.ts` script run via `npx tsx` so it executes under the target project's own tsconfig/node_modules. Don't assume CLI code has access to a live Container.",
        ].join("\n");
    }

    getRoutingConventions(): string {
        return [
            "Controllers use @Controller(prefix) at the class level and @Get/@Post/@Put/@Patch/@Delete(path) on methods; params via @Body()/@Param()/@Query()/@Req()/@Res().",
            "Route resolution happens once at boot — NyalaApplication.bindRoutes() walks the ModuleGraph, resolves every @Controller-decorated class through the container, and registers its routes on the HTTP adapter.",
            "Controllers are registered in the DI container as regular providers (not a separate registry) — a class in `controllers: []` but missing from `providers: []` in @Module is fine; the module loader adds controllers as providers automatically.",
        ].join("\n");
    }

    getTenancyConventions(): string {
        return [
            "Multi-tenant isolation is FAIL-CLOSED by design, enforced at the data layer, not opt-in per query. @nyalajs/database's Model throws if a tenant-scoped table (has a tenant_id column) is queried/written with no active tenant — it never silently returns cross-tenant rows.",
            "The active tenant is propagated via TenantContext (AsyncLocalStorage, @nyalajs/core), set by TenantMiddleware (@nyalajs/tenancy) from a chain of TenantResolvers (JWT, subdomain, header — tried in order, first non-empty wins).",
            "Every HTTP request already runs inside a TenantContext.run() scope (wired in the Fastify adapter itself), so TenantContext.get() works anywhere in request-scoped code, not just inside middleware.",
            "A repository/service must NEVER store the current tenant id as an instance field — DI services are singletons shared across concurrent requests; reading TenantContext.get() fresh on every call is the only safe pattern.",
            "When suggesting a new tenant-aware repository, prefer extending @nyalajs/database's Model (gets this enforcement for free) or @nyalajs/tenancy's TenantRepository<T extends Model> over hand-rolling tenant filtering.",
        ].join("\n");
    }

    getValidationConventions(): string {
        return [
            "@nyalajs/validation's ValidationPipe.validate(schema, data) wraps Zod: on failure it throws UnprocessableEntityException (422) with a `details: {path, message}[]` array, not a generic error.",
            "There is no class-validator-style decorator-based validation (`@IsEmail()` etc.) — schemas are plain Zod schemas, typically defined alongside the request/DTO type they validate.",
        ].join("\n");
    }

    getCliConventions(): string {
        return [
            "`nyala generate <kind> <Name>` accepts the name with or without its conventional suffix (`generate policy User` and `generate policy UserPolicy` both produce UserPolicy).",
            "Some generator kinds (model, migration, repository, request, event, listener, job, plugin) currently scaffold a clearly-marked stub rather than fully working code, because the underlying subsystem isn't fully wired to the generator yet — say so plainly if asked to generate one of these, don't imply it's complete.",
            "An installed @nyalajs/* package can contribute its own CLI commands by exporting `registerCommands(program)` from a `./cli` subpath, declared in its own package.json \"exports\" map — the CLI discovers this from the project's own package.json dependencies, not a hardcoded list.",
        ].join("\n");
    }

    getAll(): Record<string, string> {
        return {
            dependencyInjection: this.getDependencyInjection(),
            moduleStructure: this.getModuleStructure(),
            routing: this.getRoutingConventions(),
            tenancy: this.getTenancyConventions(),
            validation: this.getValidationConventions(),
            cli: this.getCliConventions(),
        };
    }

    /** Renders every section as one system-prompt-ready block. */
    asPromptBlock(): string {
        const sections = this.getAll();
        return Object.entries(sections)
            .map(([name, content]) => `## ${name}\n${content}`)
            .join("\n\n");
    }
}

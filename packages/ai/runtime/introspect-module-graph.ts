/**
 * Executed via `npx tsx` from the target project's own directory (not
 * compiled by @nyalajs/ai's own tsc build), so it can boot the project's
 * real root module using the project's own tsconfig/node_modules — the
 * same reason @nyalajs/cli's runtime/migration-runner.ts works this way.
 *
 * Boots the app's actual Kernel to get the REAL module graph and routes,
 * not a regex-scraped approximation. This means provider constructors and
 * onModuleInit() hooks genuinely run, exactly like a normal app boot — if
 * any provider has side effects on construction (e.g. opening a real
 * connection), those happen here too. There is currently no "dry" boot
 * mode in @nyalajs/core; this is a known, deliberate tradeoff for getting
 * real (not approximated) structural data.
 *
 * Reads its instructions from an env var set by ProjectContextService:
 *   NYALA_AI_APP_MODULE_PATH   absolute path to the file exporting the root @Module
 */
import "reflect-metadata";
import { NyalaFactory, RouteResolver, MetadataScanner } from "@nyalajs/core";

async function main(): Promise<void> {
    const appModulePath = process.env.NYALA_AI_APP_MODULE_PATH;
    if (!appModulePath) {
        throw new Error("introspect-module-graph requires NYALA_AI_APP_MODULE_PATH");
    }

    const scanner = new MetadataScanner();
    const imported = await import(appModulePath);
    const rootModule = Object.values(imported).find(
        (value): value is new (...args: any[]) => any =>
            typeof value === "function" && scanner.getModuleMetadata(value as any) !== undefined
    );

    if (!rootModule) {
        throw new Error(`No @Module()-decorated export found in ${appModulePath}`);
    }

    // NyalaFactory.create() is the same public bootstrap path a real
    // main.ts uses — Kernel itself isn't (and doesn't need to be) exported.
    const app = await NyalaFactory.create(rootModule);
    const kernel = app.getKernel();

    const graph = kernel.getModuleGraph();
    const modules = graph.values().map((node) => ({
        name: node.id,
        imports: node.imports.map((m) => m.id),
        providers: [...node.providers.keys()]
            .filter((token): token is Function => typeof token === "function")
            .map((token) => token.name),
        controllers: (node.metadata.controllers ?? []).map((c) => c.name),
    }));

    const routeResolver = new RouteResolver(scanner, kernel.getContainer(), graph);
    const routes = routeResolver.resolveRoutes().map((route) => ({
        method: route.method,
        path: route.path,
        controller: route.controller.name,
        handler: route.handlerName,
    }));

    process.stdout.write(JSON.stringify({ modules, routes }));
    process.exit(0);
}

main().catch((error) => {
    process.stderr.write(JSON.stringify({ error: error?.message ?? String(error) }));
    process.exit(1);
});

import { InertiaResponse, InertiaProps, InertiaResponseRequest, InertiaResponseReply } from "./inertia-response";
import { AssetVersionResolver } from "./asset-version";
import { RootHtmlOptions } from "./html-shell";

/**
 * Process-wide config set once at bootstrap (see InertiaModule/setup below)
 * so every `inertia(req, ...)` call site doesn't have to thread the asset
 * resolver and HTML shell options through by hand — mirrors how
 * @nyalajs/react's view() needs no per-call config because DefaultLayout
 * is a module-level default (packages/react/src/view.ts).
 */
export interface InertiaConfig {
    assets: AssetVersionResolver;
    html: Omit<RootHtmlOptions, "assets">;
}

let globalConfig: InertiaConfig | null = null;

/**
 * Configures the asset resolver + HTML shell options used by every
 * `inertia()` call. Call once from bootstrap/main.ts, before the HTTP
 * server starts handling requests. See templates/inertia-starter's
 * bootstrap/main.ts for a full working example.
 */
export function configureInertia(config: InertiaConfig): void {
    globalConfig = config;
}

/** For tests: resets configureInertia()'s module-level state between test files. */
export function resetInertiaConfig(): void {
    globalConfig = null;
}

function requireConfig(): InertiaConfig {
    if (!globalConfig) {
        throw new Error(
            "[@nyalajs/inertia] inertia() was called before configureInertia() ran. " +
            "Call configureInertia({ assets, html }) once in bootstrap/main.ts before app.listen()."
        );
    }
    return globalConfig;
}

/**
 * Controller-facing helper mirroring @nyalajs/react's view() ergonomics
 * (packages/react/src/view.ts) exactly: call it, return the result, done.
 *
 * @example
 *   @Get("/users")
 *   index(@Req() req: FastifyRequest, @Res() reply: FastifyReply) {
 *       return inertia(req, reply, "Users/Index", {
 *           users: () => this.usersService.findAll(),
 *       });
 *   }
 */
export function inertia(
    request: InertiaResponseRequest,
    reply: InertiaResponseReply | undefined,
    component: string,
    props: InertiaProps = {}
): InertiaResponse {
    const config = requireConfig();

    return new InertiaResponse(component, props, request, {
        version: config.assets.getVersion(),
        html: { ...config.html, assets: config.assets },
        reply,
    });
}

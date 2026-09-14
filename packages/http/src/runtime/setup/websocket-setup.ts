import { FastifyInstance } from "fastify";
import { Kernel } from "@nyalajs/core";
import { GatewayResolver } from "../../websocket/runtime/gateway-resolver";
import { registerWebSocketGateways } from "../../websocket/runtime/websocket-adapter";

/**
 * Registers @fastify/websocket and the nested plugin that binds
 * @WebSocketGateway()s once the Kernel becomes available.
 *
 * Gateway routes MUST be added as ordinary routes before the
 * instance is ready()/listen()-ed — Fastify permanently locks
 * route registration once ready() resolves (FST_ERR_INSTANCE_ALREADY_LISTENING),
 * so "await app.ready() then app.get(...)" is not legal, only
 * "app.get(...) then await app.ready()" is. But they also can't
 * be added HERE directly: @fastify/websocket's onRoute hook
 * (which makes {websocket:true} routes actually work) only
 * attaches once that plugin's own async registration has run,
 * and plain top-level app.get() calls in this constructor are
 * not guaranteed to run after it.
 *
 * The fix is a nested app.register(): Fastify's plugin queue
 * guarantees any nested register() body starts only after the
 * plugin registered immediately before it (here, @fastify/websocket)
 * has finished — the standard way @fastify/websocket's own docs
 * show routes being added. `kernel` isn't known yet at
 * construction time (this constructor only receives a Container),
 * so this callback awaits `gatewaysReady`, resolved later by
 * registerWebSocketGateways(kernel) — which itself must be called
 * before app.ready()/listen(), not after.
 */
export function setupWebSocketGateways(app: FastifyInstance, gatewaysReady: Promise<Kernel>): void {
    app.register(require("@fastify/websocket"));

    app.register(async (instance) => {
        const kernel = await gatewaysReady;
        const resolver = new GatewayResolver(kernel.getContainer(), kernel.getModuleGraph());
        registerWebSocketGateways(instance, kernel.getContainer(), resolver);
    });
}

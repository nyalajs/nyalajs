import { Container, ModuleGraph, Type } from "@nyalajs/core";
import { NYALA_WS_GATEWAY, WebSocketGatewayOptions } from "../decorators/gateway";
import {
    NYALA_WS_SUBSCRIPTIONS,
    NYALA_WS_BINARY_SUBSCRIPTIONS,
    WsSubscriptionDefinition,
} from "../decorators/subscribe-message";
import { NYALA_WS_ON_CONNECT, NYALA_WS_ON_DISCONNECT } from "../decorators/lifecycle";

export interface ResolvedGateway {
    gatewayClass: Type;
    path: string;
    subscriptions: WsSubscriptionDefinition[];
    binarySubscriptions: WsSubscriptionDefinition[];
    onConnectHandler?: string | symbol;
    onDisconnectHandler?: string | symbol;
}

/**
 * Finds every @WebSocketGateway()-decorated class reachable from the module
 * graph (declared as an ordinary provider — a gateway is a service with
 * decorated methods, not something with its own module-metadata slot) and
 * reads its subscription/lifecycle metadata. Mirrors
 * @nyalajs/microservices' MicroserviceRouteResolver.
 */
export class GatewayResolver {
    constructor(
        private readonly container: Container,
        private readonly moduleGraph: ModuleGraph
    ) {}

    resolveGateways(): ResolvedGateway[] {
        const gateways: ResolvedGateway[] = [];
        const seen = new Set<Type>();

        for (const module of this.moduleGraph.values()) {
            for (const [token] of module.providers) {
                if (typeof token !== "function" || seen.has(token as Type)) continue;

                const gatewayMeta: WebSocketGatewayOptions | undefined = Reflect.getMetadata(
                    NYALA_WS_GATEWAY,
                    token
                );
                if (!gatewayMeta) continue;

                seen.add(token as Type);

                try {
                    this.container.resolve(token as Type);
                } catch {
                    continue;
                }

                gateways.push({
                    gatewayClass: token as Type,
                    path: gatewayMeta.path ?? "/ws",
                    subscriptions: Reflect.getMetadata(NYALA_WS_SUBSCRIPTIONS, token) ?? [],
                    binarySubscriptions: Reflect.getMetadata(NYALA_WS_BINARY_SUBSCRIPTIONS, token) ?? [],
                    onConnectHandler: Reflect.getMetadata(NYALA_WS_ON_CONNECT, token),
                    onDisconnectHandler: Reflect.getMetadata(NYALA_WS_ON_DISCONNECT, token),
                });
            }
        }

        return gateways;
    }
}

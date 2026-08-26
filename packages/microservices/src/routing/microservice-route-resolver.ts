import { Container, ModuleGraph, Type } from "@nyalajs/core";
import { NYALA_MESSAGE_PATTERN, NYALA_EVENT_PATTERN, PatternHandlerDefinition } from "../decorators/message-pattern";

export interface ResolvedPatternHandler {
    pattern: string;
    kind: "message" | "event";
    controller: Type;
    handlerName: string;
}

/**
 * Same shape as core's RouteResolver, but scans @MessagePattern/@EventPattern
 * metadata instead of @Get/@Post — controllers can carry both HTTP routes
 * and message patterns at once, so a module works unchanged whether it's
 * mounted on the HTTP adapter, a microservice transport, or both (hybrid app).
 */
export class MicroserviceRouteResolver {
    constructor(
        private readonly container: Container,
        private readonly moduleGraph: ModuleGraph
    ) {}

    resolveHandlers(): ResolvedPatternHandler[] {
        const handlers: ResolvedPatternHandler[] = [];

        for (const module of this.moduleGraph.values()) {
            const controllers = module.metadata.controllers ?? [];

            for (const controllerType of controllers) {
                try {
                    this.container.resolve(controllerType);
                } catch {
                    continue;
                }

                const messagePatterns: PatternHandlerDefinition[] =
                    Reflect.getMetadata(NYALA_MESSAGE_PATTERN, controllerType) ?? [];
                const eventPatterns: PatternHandlerDefinition[] =
                    Reflect.getMetadata(NYALA_EVENT_PATTERN, controllerType) ?? [];

                for (const def of [...messagePatterns, ...eventPatterns]) {
                    handlers.push({
                        pattern: def.pattern,
                        kind: def.kind,
                        controller: controllerType,
                        handlerName: def.handlerName as string,
                    });
                }
            }
        }

        return handlers;
    }
}

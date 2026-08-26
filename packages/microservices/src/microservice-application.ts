import { Kernel } from "@nyalajs/core";
import { Transporter, IncomingCall } from "./transports/transporter.interface";
import { createTransporter, MicroserviceOptions } from "./transports/create-transporter";
import { MicroserviceRouteResolver } from "./routing/microservice-route-resolver";
import { PatternDispatcher } from "./routing/pattern-dispatcher";

/**
 * Binds every @MessagePattern/@EventPattern handler found in the module
 * graph onto a Transporter — each handler gets its own PatternDispatcher,
 * which resolves the owning controller through the same DI container the
 * HTTP side uses and runs the guard -> interceptor -> handler ->
 * exception-filter pipeline.
 */
export function bindPatternHandlers(
    kernel: Kernel,
    transporter: Transporter,
    transportKind: MicroserviceOptions["transport"]
): void {
    const resolver = new MicroserviceRouteResolver(kernel.getContainer(), kernel.getModuleGraph());
    const handlers = resolver.resolveHandlers();

    for (const handler of handlers) {
        const dispatcher = new PatternDispatcher(kernel, handler, transportKind);

        if (handler.kind === "message") {
            transporter.addMessageHandler(handler.pattern, (call: IncomingCall) => dispatcher.dispatch(call));
        } else {
            transporter.addEventHandler(handler.pattern, (call: IncomingCall) =>
                dispatcher.dispatch(call).then(() => undefined)
            );
        }
    }
}

/**
 * Standalone microservice application — the counterpart to NyalaApplication,
 * but listening on a message-pattern transport instead of HTTP. Created via
 * `MicroserviceFactory.create()`.
 */
export class NyalaMicroserviceApplication {
    private transporter?: Transporter;
    private shutdownHooksInstalled = false;

    constructor(
        private readonly kernel: Kernel,
        private readonly config: MicroserviceOptions
    ) {}

    async listen(): Promise<void> {
        this.transporter = createTransporter(this.config);
        bindPatternHandlers(this.kernel, this.transporter, this.config.transport);
        await this.transporter.listen();
    }

    /**
     * Registers SIGTERM/SIGINT handlers that close() the app (draining
     * in-flight calls via the transport's own graceful close) before the
     * process exits — the microservice counterpart to what a container
     * orchestrator's shutdown grace period expects. Opt-in: call this after
     * listen() in your bootstrap function, matching how NyalaApplication
     * leaves process lifecycle to the caller rather than assuming ownership
     * of it (e.g. tests boot/close an app many times in one process).
     */
    enableShutdownHooks(): this {
        if (this.shutdownHooksInstalled) return this;
        this.shutdownHooksInstalled = true;

        const shutdown = async (signal: string) => {
            console.log(`[nyala] ${signal} received, draining microservice connections...`);
            try {
                await this.close();
                process.exit(0);
            } catch (error) {
                console.error("[nyala] Error during microservice shutdown:", error);
                process.exit(1);
            }
        };

        process.once("SIGTERM", () => void shutdown("SIGTERM"));
        process.once("SIGINT", () => void shutdown("SIGINT"));

        return this;
    }

    async close(): Promise<void> {
        await this.transporter?.close();
        await this.kernel.shutdown();
    }

    async isHealthy(): Promise<boolean> {
        return (await this.transporter?.isHealthy()) ?? false;
    }

    getKernel(): Kernel {
        return this.kernel;
    }
}

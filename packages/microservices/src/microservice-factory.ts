import { Kernel, Type, installProcessErrorHandlers } from "@nyalajs/core";
import { NyalaMicroserviceApplication } from "./microservice-application";
import { MicroserviceOptions } from "./transports/create-transporter";

/**
 * Standalone microservice entry point — the transport-aware counterpart to
 * `NyalaFactory.create()`. Boots the same module graph / DI container as an
 * HTTP app, but binds @MessagePattern/@EventPattern handlers onto a message
 * transport instead of Fastify.
 *
 * @example
 *   const app = await MicroserviceFactory.create(AppModule, {
 *     transport: "tcp",
 *     options: { port: 4001 },
 *   });
 *   await app.listen();
 */
export class MicroserviceFactory {
    static async create(
        rootModule: Type,
        config: MicroserviceOptions
    ): Promise<NyalaMicroserviceApplication> {
        installProcessErrorHandlers();
        const kernel = new Kernel();
        await kernel.bootstrap(rootModule);
        return new NyalaMicroserviceApplication(kernel, config);
    }
}

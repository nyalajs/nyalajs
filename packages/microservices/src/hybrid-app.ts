import { NyalaApplication } from "@nyalajs/core";
import { Transporter } from "./transports/transporter.interface";
import { createTransporter, MicroserviceOptions } from "./transports/create-transporter";
import { bindPatternHandlers } from "./microservice-application";

/**
 * Attaches a microservice transport to an existing NyalaApplication so one
 * process can serve HTTP routes and message patterns side by side — a
 * "hybrid app". Handlers are bound against the same module graph / DI
 * container the HTTP adapter uses, so a controller can carry both @Get()
 * and @MessagePattern() methods, or split HTTP and RPC concerns across
 * controllers within the same module.
 *
 * The transport does not start listening until `startMicroservices()` is
 * called — typically right before `app.listen()`.
 *
 * @example
 *   const app = await NyalaFactory.create(AppModule);
 *   app.setHttpAdapter(new FastifyAdapter(app.getKernel().getContainer()));
 *   connectMicroservice(app, { transport: "tcp", options: { port: 4001 } });
 *   await startMicroservices(app);
 *   await app.listen(3000);
 */
const attachedTransporters = new WeakMap<NyalaApplication, Transporter[]>();

export function connectMicroservice(app: NyalaApplication, config: MicroserviceOptions): void {
    const transporter = createTransporter(config);
    bindPatternHandlers(app.getKernel(), transporter, config.transport);

    const existing = attachedTransporters.get(app) ?? [];
    existing.push(transporter);
    attachedTransporters.set(app, existing);
}

/** Starts every transport registered via connectMicroservice() for this app. */
export async function startMicroservices(app: NyalaApplication): Promise<void> {
    const transporters = attachedTransporters.get(app) ?? [];
    await Promise.all(transporters.map((t) => t.listen()));
}

/** Stops every transport registered via connectMicroservice() for this app. */
export async function closeMicroservices(app: NyalaApplication): Promise<void> {
    const transporters = attachedTransporters.get(app) ?? [];
    await Promise.all(transporters.map((t) => t.close()));
}

/** True only if every transport registered via connectMicroservice() for this app reports healthy. */
export async function areMicroservicesHealthy(app: NyalaApplication): Promise<boolean> {
    const transporters = attachedTransporters.get(app) ?? [];
    if (transporters.length === 0) return true;
    const results = await Promise.all(transporters.map((t) => t.isHealthy()));
    return results.every(Boolean);
}

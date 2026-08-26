import { Container, Kernel, MetadataScanner, Type, getCatchTypes } from "@nyalajs/core";
import { ZodError } from "zod";
import { IncomingCall } from "../transports/transporter.interface";
import { MicroserviceContext, TransportKind } from "../client/client-proxy";
import { runWithIncomingTrace } from "../context/trace-propagation";
import { getMicroserviceParamMetadata, MicroserviceParamType } from "../decorators/payload";
import { getPayloadSchema, MicroservicePayloadValidationError } from "../decorators/validate-payload";
import { MicroserviceExecutionContext } from "../context/microservice-execution-context";
import { MicroserviceGuard } from "../interfaces/guard.interface";
import { MicroserviceInterceptor } from "../interfaces/interceptor.interface";
import { MicroserviceExceptionFilter } from "../interfaces/exception-filter.interface";
import { ResolvedPatternHandler } from "./microservice-route-resolver";

export class MicroservicePermissionDeniedError extends Error {
    constructor(pattern: string) {
        super(`Access denied for pattern "${pattern}"`);
        this.name = "MicroservicePermissionDeniedError";
    }
}

/**
 * Runs the same guard -> interceptor -> handler -> exception-filter pipeline
 * @nyalajs/http's FastifyAdapter runs for routes, but for one
 * @MessagePattern/@EventPattern handler. Shared by every transport so guard
 * and interceptor behavior is identical whether the call arrived over TCP,
 * Redis, gRPC, NATS, or Kafka.
 */
export class PatternDispatcher {
    private readonly metadataScanner = new MetadataScanner();

    constructor(
        private readonly kernel: Kernel,
        private readonly handler: ResolvedPatternHandler,
        private readonly transportKind: TransportKind
    ) {}

    async dispatch(call: IncomingCall): Promise<any> {
        return runWithIncomingTrace(call.trace, () => this.dispatchInScope(call));
    }

    private async dispatchInScope(call: IncomingCall): Promise<any> {
        const container = this.kernel.getContainer();
        const { controller, handlerName, pattern, kind } = this.handler;

        const ctx: MicroserviceContext = {
            pattern,
            transport: this.transportKind,
            trace: call.trace,
        };

        const executionContext: MicroserviceExecutionContext = {
            payload: call.payload,
            ctx,
            container,
            controller,
            handlerName,
            kind,
        };

        try {
            const guards = this.metadataScanner.getGuards(controller, handlerName) as unknown as Type<MicroserviceGuard>[];
            for (const GuardClass of guards) {
                const guard = container.resolve(GuardClass);
                const allowed = await guard.canActivate(executionContext);
                if (!allowed) {
                    throw new MicroservicePermissionDeniedError(pattern);
                }
            }

            const validatedPayload = this.validatePayload(controller, handlerName, call.payload);

            const interceptors = this.metadataScanner.getInterceptors(controller, handlerName) as unknown as Type<MicroserviceInterceptor>[];
            const invokeHandler = async () => {
                const instance = container.resolve(controller) as any;
                const args = this.resolveHandlerArgs(controller, handlerName, validatedPayload, ctx);
                return instance[handlerName](...args);
            };

            return await this.runInterceptors(interceptors, executionContext, invokeHandler, container);
        } catch (error) {
            return this.handleError(error as Error, executionContext, container);
        }
    }

    private async runInterceptors(
        interceptors: Type<MicroserviceInterceptor>[],
        ctx: MicroserviceExecutionContext,
        handler: () => Promise<any>,
        container: Container
    ): Promise<any> {
        let index = 0;

        const next = async (): Promise<any> => {
            if (index >= interceptors.length) {
                return handler();
            }
            const InterceptorClass = interceptors[index++];
            const interceptor = container.resolve(InterceptorClass);
            return interceptor.intercept(ctx, next);
        };

        return next();
    }

    private async handleError(
        error: Error,
        executionContext: MicroserviceExecutionContext,
        container: Container
    ): Promise<any> {
        const filters = this.metadataScanner.getFilters(
            this.handler.controller,
            this.handler.handlerName
        ) as unknown as Type<MicroserviceExceptionFilter>[];

        for (const FilterClass of filters) {
            const catchTypes = getCatchTypes(FilterClass);
            const matches = catchTypes.length === 0 || catchTypes.some((type) => error instanceof type);

            if (matches) {
                const filter = container.resolve(FilterClass);
                return filter.catch(error, executionContext);
            }
        }

        // No filter matched (or none declared): for a "message" pattern this
        // propagates up to the transport, which turns it into an error reply
        // frame — same as ExceptionHandler's default JSON error body on the
        // HTTP side. For an "event" pattern the transport logs and drops it.
        throw error;
    }

    private validatePayload(controller: Type, handlerName: string, payload: any): any {
        const schema = getPayloadSchema(controller, handlerName);
        if (!schema) return payload;

        try {
            return schema.parse(payload);
        } catch (error) {
            if (error instanceof ZodError) {
                const details = error.issues.map((issue) => ({
                    path: issue.path.join("."),
                    message: issue.message,
                }));
                throw new MicroservicePayloadValidationError("Payload validation failed", details);
            }
            throw error;
        }
    }

    private resolveHandlerArgs(
        controller: Type,
        handlerName: string,
        payload: any,
        ctx: MicroserviceContext
    ): any[] {
        const paramMeta = getMicroserviceParamMetadata(controller, handlerName);

        if (paramMeta.length === 0) {
            return [payload];
        }

        const args: any[] = [];
        for (const meta of [...paramMeta].sort((a, b) => a.index - b.index)) {
            args[meta.index] = meta.type === MicroserviceParamType.PAYLOAD ? payload : ctx;
        }
        return args;
    }
}

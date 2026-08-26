import { Container, Kernel, MetadataScanner, Type, getCatchTypes } from "@nyalajs/core";
import { GraphQLResolveInfo } from "graphql";
import { GraphqlContext, GraphqlExecutionContext } from "../context/graphql-execution-context";
import { GraphqlGuard } from "../interfaces/guard.interface";
import { GraphqlInterceptor } from "../interfaces/interceptor.interface";
import { GraphqlExceptionFilter } from "../interfaces/exception-filter.interface";
import { getGqlParamMetadata, GqlParamType } from "../decorators/params";

export class GraphqlPermissionDeniedError extends Error {
    constructor(fieldName: string) {
        super(`Access denied for field "${fieldName}"`);
        this.name = "GraphqlPermissionDeniedError";
    }
}

/**
 * Runs the same guard -> interceptor -> handler -> exception-filter pipeline
 * @nyalajs/http's FastifyAdapter and @nyalajs/microservices' PatternDispatcher
 * run, for one GraphQL field resolution. One instance is built per resolver
 * method at schema-build time and reused as that field's graphql-js resolve
 * function for every call.
 */
export class GraphqlFieldDispatcher {
    private readonly metadataScanner = new MetadataScanner();

    constructor(
        private readonly kernel: Kernel,
        private readonly resolverClass: Type,
        private readonly handlerName: string,
        private readonly operationKind: "query" | "mutation" | "subscription" | "field",
        /** Field name as exposed in the schema — used only for error messages (GraphqlPermissionDeniedError). */
        private readonly fieldName: string
    ) {}

    async resolve(parent: any, args: any, ctx: GraphqlContext, info: GraphQLResolveInfo): Promise<any> {
        const container = this.kernel.getContainer();

        const executionContext: GraphqlExecutionContext = {
            args,
            parent,
            ctx,
            info,
            container,
            resolverClass: this.resolverClass,
            handlerName: this.handlerName,
            operationKind: this.operationKind,
        };

        try {
            const guards = this.metadataScanner.getGuards(this.resolverClass, this.handlerName) as unknown as Type<GraphqlGuard>[];
            for (const GuardClass of guards) {
                const guard = container.resolve(GuardClass);
                const allowed = await guard.canActivate(executionContext);
                if (!allowed) {
                    throw new GraphqlPermissionDeniedError(this.fieldName);
                }
            }

            const interceptors = this.metadataScanner.getInterceptors(this.resolverClass, this.handlerName) as unknown as Type<GraphqlInterceptor>[];
            const invokeHandler = async () => {
                const instance = container.resolve(this.resolverClass) as any;
                const handlerArgs = this.resolveHandlerArgs(parent, args, executionContext, info);
                return instance[this.handlerName](...handlerArgs);
            };

            return await this.runInterceptors(interceptors, executionContext, invokeHandler, container);
        } catch (error) {
            return this.handleError(error as Error, executionContext, container);
        }
    }

    private async runInterceptors(
        interceptors: Type<GraphqlInterceptor>[],
        ctx: GraphqlExecutionContext,
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

    /**
     * On no matching filter, rethrows — graphql-js catches it, records a
     * GraphQLError in the response's `errors` array, and resolves this
     * field (and every field depending on it, if non-nullable) to null.
     * This mirrors microservices' "message" pattern default: no filter
     * means the error surfaces to the caller rather than being swallowed.
     */
    private async handleError(error: Error, executionContext: GraphqlExecutionContext, container: Container): Promise<any> {
        const filters = this.metadataScanner.getFilters(this.resolverClass, this.handlerName) as unknown as Type<GraphqlExceptionFilter>[];

        for (const FilterClass of filters) {
            const catchTypes = getCatchTypes(FilterClass);
            const matches = catchTypes.length === 0 || catchTypes.some((type) => error instanceof type);
            if (matches) {
                const filter = container.resolve(FilterClass);
                return filter.catch(error, executionContext);
            }
        }

        throw error;
    }

    private resolveHandlerArgs(parent: any, args: any, executionContext: GraphqlExecutionContext, info: GraphQLResolveInfo): any[] {
        const paramMeta = getGqlParamMetadata(this.resolverClass, this.handlerName);

        // No @Args()/@Ctx()/@Parent()/@Info() decorators at all: fall back to
        // the conventional graphql-js resolver signature (parent, args, ctx, info)
        // so a plain method still works without decorating every parameter.
        if (paramMeta.length === 0) {
            return [parent, args, executionContext.ctx, info];
        }

        const handlerArgs: any[] = [];
        for (const meta of [...paramMeta].sort((a, b) => a.index - b.index)) {
            switch (meta.type) {
                case GqlParamType.ARGS:
                    handlerArgs[meta.index] = args;
                    break;
                case GqlParamType.SINGLE_ARG:
                    handlerArgs[meta.index] = meta.argName ? args?.[meta.argName] : undefined;
                    break;
                case GqlParamType.CONTEXT:
                    handlerArgs[meta.index] = executionContext.ctx;
                    break;
                case GqlParamType.PARENT:
                    handlerArgs[meta.index] = parent;
                    break;
                case GqlParamType.INFO:
                    handlerArgs[meta.index] = info;
                    break;
            }
        }
        return handlerArgs;
    }
}

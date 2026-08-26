import "reflect-metadata";
import Fastify, { type FastifyInstance } from "fastify";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Injectable, Kernel, Module, UseGuards, UseInterceptors, UseFilters, Catch } from "@nyalajs/core";
import { ObjectType, Field } from "../decorators/object-type";
import { Resolver, Query } from "../decorators/resolver";
import { Args } from "../decorators/params";
import { GraphqlServer } from "../execution/graphql-server";
import { mountGraphqlServer } from "../execution/fastify-mount";
import { GraphqlGuard } from "../interfaces/guard.interface";
import { GraphqlInterceptor } from "../interfaces/interceptor.interface";
import { GraphqlExceptionFilter } from "../interfaces/exception-filter.interface";
import { GraphqlExecutionContext } from "../context/graphql-execution-context";

// Proves @UseGuards()/@UseInterceptors()/@UseFilters() from @nyalajs/core —
// the SAME decorators HTTP controllers and microservices controllers use —
// work unchanged on a @Resolver() class, because GraphqlFieldDispatcher
// reads the same NYALA_GUARDS/NYALA_INTERCEPTORS/NYALA_FILTERS metadata via
// the same MetadataScanner. This is the load-bearing claim behind "one guard
// implementation can protect a REST route, a message pattern, AND a
// GraphQL field" — worth proving directly, not just asserting in a comment.

const interceptorLog: string[] = [];

@Injectable()
class AdminOnlyGuard implements GraphqlGuard {
    canActivate(context: GraphqlExecutionContext): boolean {
        return context.ctx.isAdmin === true;
    }
}

@Injectable()
class LoggingInterceptor implements GraphqlInterceptor {
    async intercept(context: GraphqlExecutionContext, next: () => Promise<any>): Promise<any> {
        interceptorLog.push(`before:${context.handlerName}`);
        const result = await next();
        interceptorLog.push(`after:${context.handlerName}`);
        return result;
    }
}

class DomainError extends Error {}

@Injectable()
@Catch(DomainError)
class DomainErrorFilter implements GraphqlExceptionFilter {
    catch(error: Error): any {
        return `handled: ${error.message}`;
    }
}

@ObjectType()
class Secret {
    @Field(() => String)
    value!: string;
}

@Injectable()
@Resolver()
class SecretResolver {
    @Query(() => Secret)
    @UseGuards(AdminOnlyGuard)
    @UseInterceptors(LoggingInterceptor)
    adminSecret(): Secret {
        return { value: "top secret" };
    }

    @Query(() => String)
    @UseFilters(DomainErrorFilter)
    riskyOperation(@Args("shouldFail", () => Boolean) shouldFail: boolean): string {
        if (shouldFail) throw new DomainError("something went wrong");
        return "ok";
    }
}

@Module({ providers: [SecretResolver, AdminOnlyGuard, LoggingInterceptor, DomainErrorFilter] })
class GuardTestModule {}

describe("Guards/Interceptors/Filters on @Resolver() (e2e) — same @nyalajs/core decorators as HTTP/microservices", () => {
    let app: FastifyInstance;

    beforeEach(async () => {
        interceptorLog.length = 0;
        const kernel = new Kernel();
        await kernel.bootstrap(GuardTestModule);
        const server = new GraphqlServer(kernel, {
            resolvers: [SecretResolver],
            maskedErrors: false,
            // isAdmin flows from a request header into the context every
            // guard/interceptor/resolver in this test reads — proves the
            // guard receives a real, request-derived GraphqlExecutionContext,
            // not a stub with no connection to the actual HTTP call.
            context: (base) => ({ isAdmin: base.request?.headers?.["x-is-admin"] === "1" }),
        });
        app = Fastify();
        await mountGraphqlServer(app, server);
        await app.ready();
    });

    afterEach(async () => {
        await app.close();
    });

    async function gql(query: string, isAdmin: boolean) {
        const res = await app.inject({
            method: "POST",
            url: "/graphql",
            headers: { "content-type": "application/json", "x-is-admin": isAdmin ? "1" : "0" },
            payload: { query },
        });
        return res.json();
    }

    it("a real GraphqlGuard blocks the field for a non-admin caller", async () => {
        const body = await gql(`{ adminSecret { value } }`, false);
        // adminSecret's return type (Secret) isn't nullable, so per GraphQL's
        // own null-propagation rules a denied field nulls the whole
        // response's `data`, not just that one field — that's the correct,
        // spec-mandated behavior here, not a bug in the guard.
        expect(body.data).toBeNull();
        expect(body.errors[0].message).toMatch(/Access denied for field "adminSecret"/);
    });

    it("the same guard allows the field through for an admin caller", async () => {
        const body = await gql(`{ adminSecret { value } }`, true);
        expect(body.errors).toBeUndefined();
        expect(body.data.adminSecret).toEqual({ value: "top secret" });
    });

    it("a real GraphqlInterceptor runs before and after the handler, in order", async () => {
        await gql(`{ adminSecret { value } }`, true);
        expect(interceptorLog).toEqual(["before:adminSecret", "after:adminSecret"]);
    });

    it("the interceptor does NOT run when the guard blocks the field first", async () => {
        await gql(`{ adminSecret { value } }`, false);
        expect(interceptorLog).toEqual([]);
    });

    it("a real GraphqlExceptionFilter catches a thrown domain error and supplies the field's value", async () => {
        const body = await gql(`{ riskyOperation(shouldFail: true) }`, false);
        expect(body.errors).toBeUndefined();
        expect(body.data.riskyOperation).toBe("handled: something went wrong");
    });

    it("the filter is bypassed entirely when the handler doesn't throw", async () => {
        const body = await gql(`{ riskyOperation(shouldFail: false) }`, false);
        expect(body.data.riskyOperation).toBe("ok");
    });
});

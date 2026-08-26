import { Container } from "@nyalajs/core";
import DataLoader from "dataloader";

/**
 * Per-request GraphQL context — analogous to MicroserviceContext, built once
 * per HTTP request (or, for a subscription, once at subscribe-time and
 * reused for every event on that subscription) and shared by every field
 * resolver invoked while resolving that operation. Handed to graphql-yoga as
 * its resolver `context`.
 */
export interface GraphqlContext {
    /** The raw underlying HTTP request (Fastify), when running over HTTP. Undefined for a subscription's later events, which have no live request. */
    request?: any;
    /** The tenant id resolved for this request, if any — same value TenantContext.get() returns while resolvers for this operation run. */
    tenantId?: string;
    container: Container;
    /**
     * Per-request DataLoader instances. Resolvers create-and-cache their own
     * on first use, e.g. `ctx.loaders.get(UserLoader) ?? ctx.loaders.set(UserLoader, createLoader(...))`.
     * Always a fresh, empty Map per request — see createLoader()'s docs on
     * why a shared/module-level DataLoader is a cross-tenant data leak
     * waiting to happen.
     */
    loaders: Map<any, DataLoader<any, any>>;
    /** Arbitrary values a GraphqlServer's `context` option can add — auth user, etc. */
    [key: string]: any;
}

import { randomUUID } from "crypto";
import { LogContext, TenantContext } from "@nyalajs/core";

/**
 * Correlation metadata threaded alongside every call's payload, across every
 * transport. On the client side, `outgoingTrace()` continues the current
 * LogContext trace if the call happens from within a handler that's already
 * inside one (so a chain of A -> B -> C microservice calls shares one
 * traceId end to end), and mints a fresh traceId otherwise — mirroring how
 * FastifyAdapter seeds a new traceId for an inbound HTTP request that
 * doesn't already carry an `x-trace-id` header.
 */
export interface TracePropagation {
    requestId: string;
    traceId: string;
    tenantId?: string;
}

export function outgoingTrace(): TracePropagation {
    const current = LogContext.get();
    return {
        requestId: randomUUID(),
        traceId: current.traceId ?? randomUUID(),
        tenantId: TenantContext.get(),
    };
}

/**
 * Runs `fn` with LogContext/TenantContext populated from an incoming call's
 * trace metadata, so a handler's own logs (and anything it calls) carry the
 * same requestId/traceId/tenantId the caller started with — and, if this
 * handler itself calls another microservice, outgoingTrace() picks up the
 * same traceId, continuing the chain.
 */
export function runWithIncomingTrace<T>(trace: TracePropagation | undefined, fn: () => T): T {
    const requestId = trace?.requestId ?? randomUUID();
    const traceId = trace?.traceId ?? randomUUID();

    return TenantContext.run(() =>
        LogContext.run({ requestId, traceId, tenantId: trace?.tenantId }, fn)
    );
}

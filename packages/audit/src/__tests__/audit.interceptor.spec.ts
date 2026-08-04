import { describe, it, expect, vi } from "vitest";
import { AuditInterceptor } from "../audit.interceptor";
import { AuditLogger } from "../audit-logger";
import { ExecutionContext } from "@nyalajs/http";

function fakeContext(overrides: Partial<ExecutionContext["request"]> = {}, reqContext: Partial<ExecutionContext["context"]> = {}): ExecutionContext {
    return {
        request: {
            method: "GET",
            url: "/api/widgets/42",
            headers: { "user-agent": "vitest" },
            ...overrides,
        },
        response: {},
        context: {
            requestId: "req-1",
            traceId: "trace-1",
            startedAt: Date.now(),
            metadata: new Map(),
            ...reqContext,
        },
        container: {} as any,
    };
}

function fakeAuditLogger() {
    return { log: vi.fn().mockResolvedValue(undefined) } as unknown as AuditLogger;
}

describe("AuditInterceptor", () => {
    it("does not audit a GET request", async () => {
        const auditLogger = fakeAuditLogger();
        const interceptor = new AuditInterceptor(auditLogger);
        const next = vi.fn().mockResolvedValue({ id: 1 });

        const result = await interceptor.intercept(fakeContext({ method: "GET" }), next);

        expect(next).toHaveBeenCalledOnce();
        expect(auditLogger.log).not.toHaveBeenCalled();
        expect(result).toEqual({ id: 1 });
    });

    it("audits a POST request as a create action", async () => {
        const auditLogger = fakeAuditLogger();
        const interceptor = new AuditInterceptor(auditLogger);
        const next = vi.fn().mockResolvedValue({ id: "new-1" });

        await interceptor.intercept(
            fakeContext({ method: "POST", url: "/api/widgets", body: { name: "x" } }, { userId: "u1", tenantId: "t1" }),
            next
        );

        expect(auditLogger.log).toHaveBeenCalledWith(
            expect.objectContaining({
                actorId: "u1",
                tenantId: "t1",
                action: "create",
                resourceType: "api",
                requestId: "req-1",
                traceId: "trace-1",
            })
        );
    });

    it("falls back to 'anonymous' when there is no authenticated userId", async () => {
        const auditLogger = fakeAuditLogger();
        const interceptor = new AuditInterceptor(auditLogger);

        await interceptor.intercept(fakeContext({ method: "POST", url: "/api/widgets" }), vi.fn().mockResolvedValue({}));

        expect(auditLogger.log).toHaveBeenCalledWith(expect.objectContaining({ actorId: "anonymous" }));
    });

    it("maps PUT/PATCH to update and DELETE to delete", async () => {
        const auditLogger = fakeAuditLogger();
        const interceptor = new AuditInterceptor(auditLogger);
        const next = vi.fn().mockResolvedValue({});

        await interceptor.intercept(fakeContext({ method: "PUT", url: "/api/widgets/42" }), next);
        expect(auditLogger.log).toHaveBeenLastCalledWith(expect.objectContaining({ action: "update" }));

        await interceptor.intercept(fakeContext({ method: "PATCH", url: "/api/widgets/42" }), next);
        expect(auditLogger.log).toHaveBeenLastCalledWith(expect.objectContaining({ action: "update" }));

        await interceptor.intercept(fakeContext({ method: "DELETE", url: "/api/widgets/42" }), next);
        expect(auditLogger.log).toHaveBeenLastCalledWith(expect.objectContaining({ action: "delete" }));
    });

    it("extracts the numeric resourceId from the URL when present", async () => {
        const auditLogger = fakeAuditLogger();
        const interceptor = new AuditInterceptor(auditLogger);

        await interceptor.intercept(fakeContext({ method: "DELETE", url: "/api/widgets/42" }), vi.fn().mockResolvedValue({}));

        expect(auditLogger.log).toHaveBeenCalledWith(expect.objectContaining({ resourceId: "42", resourceType: "widgets" }));
    });

    it("falls back to the created result's id when the URL has no numeric segment", async () => {
        const auditLogger = fakeAuditLogger();
        const interceptor = new AuditInterceptor(auditLogger);

        await interceptor.intercept(
            fakeContext({ method: "POST", url: "/api/widgets" }),
            vi.fn().mockResolvedValue({ id: "generated-id" })
        );

        expect(auditLogger.log).toHaveBeenCalledWith(expect.objectContaining({ resourceId: "generated-id" }));
    });

    it("uses request.ip, falling back to the x-forwarded-for header", async () => {
        const auditLogger = fakeAuditLogger();
        const interceptor = new AuditInterceptor(auditLogger);

        await interceptor.intercept(
            fakeContext({ method: "POST", url: "/api/widgets", headers: { "x-forwarded-for": "1.2.3.4" } }),
            vi.fn().mockResolvedValue({})
        );

        expect(auditLogger.log).toHaveBeenCalledWith(expect.objectContaining({ ip: "1.2.3.4" }));
    });

    it("propagates the handler's return value even when auditing", async () => {
        const auditLogger = fakeAuditLogger();
        const interceptor = new AuditInterceptor(auditLogger);

        const result = await interceptor.intercept(
            fakeContext({ method: "POST", url: "/api/widgets" }),
            vi.fn().mockResolvedValue({ id: "abc" })
        );

        expect(result).toEqual({ id: "abc" });
    });
});

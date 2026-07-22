import { Injectable } from "@nyala/core";
import { Interceptor, ExecutionContext } from "@nyala/http";
import { AuditLogger } from "./audit-logger";
import { AuditAction } from "./audit-event";

@Injectable()
export class AuditInterceptor implements Interceptor {
    constructor(private readonly auditLogger: AuditLogger) { }

    async intercept(
        context: ExecutionContext,
        next: () => Promise<any>
    ): Promise<any> {
        const { request, context: reqContext } = context;
        const method = request.method;

        // Determine if this is an auditable action
        const auditableActions = ["POST", "PUT", "PATCH", "DELETE"];

        if (!auditableActions.includes(method)) {
            return await next();
        }

        const before = await this.captureState(context);
        const result = await next();
        const after = result;

        // Log audit event
        await this.auditLogger.log({
            actorId: reqContext.userId ?? "anonymous",
            tenantId: reqContext.tenantId,
            action: this.mapMethodToAction(method),
            resourceType: this.extractResourceType(request.url),
            resourceId: this.extractResourceId(request.url, result),
            ip: request.ip ?? request.headers["x-forwarded-for"] ?? "unknown",
            userAgent: request.headers["user-agent"] ?? "unknown",
            requestId: reqContext.requestId,
            traceId: reqContext.traceId,
            metadata: {
                method,
                url: request.url,
                body: request.body,
            },
            changes: before ? { before, after } : undefined,
        });

        return result;
    }

    private mapMethodToAction(method: string): string {
        const mapping: Record<string, string> = {
            POST: AuditAction.CREATE,
            PUT: AuditAction.UPDATE,
            PATCH: AuditAction.UPDATE,
            DELETE: AuditAction.DELETE,
        };

        return mapping[method] ?? "unknown";
    }

    private extractResourceType(url: string): string {
        // Extract resource type from URL (e.g., /api/users/123 -> users)
        const parts = url.split("/").filter(Boolean);
        return parts[parts.length - 2] ?? "unknown";
    }

    private extractResourceId(url: string, result: any): string {
        // Try to extract from URL or result
        const parts = url.split("/").filter(Boolean);
        const lastPart = parts[parts.length - 1];

        if (lastPart && !isNaN(Number(lastPart))) {
            return lastPart;
        }

        return result?.id ?? "unknown";
    }

    private async captureState(context: ExecutionContext): Promise<any> {
        // For UPDATE/DELETE, capture current state
        // This would require fetching the resource first
        return null;
    }
}

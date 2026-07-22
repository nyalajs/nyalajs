export interface AuditEvent {
    id?: string;
    actorId: string;
    tenantId?: string;
    action: string;
    resourceType: string;
    resourceId: string;
    timestamp: Date;
    ip: string;
    userAgent: string;
    requestId: string;
    traceId: string;
    metadata: Record<string, any>;
    changes?: {
        before: any;
        after: any;
    };
}

export enum AuditAction {
    CREATE = "create",
    UPDATE = "update",
    DELETE = "delete",
    LOGIN = "login",
    LOGOUT = "logout",
    PERMISSION_CHANGE = "permission_change",
    TENANT_CHANGE = "tenant_change",
    ADMIN_ACTION = "admin_action",
}

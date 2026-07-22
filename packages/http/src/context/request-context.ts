export interface RequestContext {
    requestId: string;
    traceId: string;
    tenantId?: string;
    userId?: string;
    locale?: string;
    startedAt: number;
    metadata: Map<string, any>;
}

export interface TenantContext {
    id: string;
    plan: string;
    features: string[];
    metadata: Record<string, any>;
}

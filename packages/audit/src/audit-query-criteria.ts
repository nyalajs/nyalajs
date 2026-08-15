/**
 * Filter criteria for AuditLogger.query()/AuditStorage.query(). Every field
 * is optional and AND-ed together — e.g. {tenantId, action: "delete"}
 * returns only "delete" events for that tenant, not "delete" events for
 * anyone plus every event for that tenant.
 */
export interface AuditQueryCriteria {
    action?: string;
    resourceType?: string;
    resourceId?: string;
    tenantId?: string;
    actorId?: string;
    /** Inclusive lower bound on `timestamp`. */
    from?: Date;
    /** Inclusive upper bound on `timestamp`. */
    to?: Date;
    limit?: number;
}

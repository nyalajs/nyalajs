/**
 * Identifies WHO a role/permission check is about. Polymorphic, matching
 * ModelHasRole/ModelHasPermission's modelType/modelId columns — usually a
 * User, but can be any model (an ApiClient, a Team...). `guardName`
 * defaults to "api" (this framework's default JWT guard — see
 * @nyalajs/security's JwtStrategy) when omitted.
 */
export interface Subject {
    modelType: string;
    modelId: string;
    guardName?: string;
    /**
     * Tenant/team this check runs within — pass your app's real tenant id
     * directly (e.g. from `TenantContext.get()` or `UserIdentity.tenantId`),
     * no translation needed. Omit for a global (non-team) check.
     *
     * Named `tenantId` here (the public-facing name apps already know) even
     * though it's stored in the `teamId` DB column underneath — see
     * role.model.ts's top comment for why the column itself isn't literally
     * named `tenantId` (@nyalajs/database auto-scopes any table with that
     * exact column name, which would break global/non-team roles).
     */
    tenantId?: string;
}

/** Builds a Subject from any object with an `id` — the common case (a User instance or a plain {id} shape). */
export function subjectFor(modelType: string, model: { id: string | number }, options: { guardName?: string; tenantId?: string } = {}): Subject {
    return {
        modelType,
        modelId: String(model.id),
        guardName: options.guardName,
        tenantId: options.tenantId,
    };
}

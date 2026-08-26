import { Model, Table, Primary, StringColumn, TimestampColumn, BelongsToMany } from "@nyalajs/database";
import { Permission } from "./permission.model";

/**
 * A named collection of permissions, assignable to any model (typically a
 * User). Mirrors Spatie laravel-permission's `Role` model: `name` +
 * `guardName` are unique together (not `name` alone) — the same role name
 * can exist once per guard ("admin" for the "api" guard and a separate
 * "admin" for the "web" guard are two different rows), and once per team
 * when `teamId` is populated (see the package README's "Teams" section).
 *
 * `teamId`, not `tenantId`: @nyalajs/database auto-scopes any table with a
 * literal `tenantId` column, throwing if no TenantContext is active — wrong
 * here, since a global (no-team) role and a team-scoped role must coexist
 * in the same table. `teamId` (Spatie's own name for this feature) avoids
 * that auto-scoping; RoleService applies team filtering explicitly instead.
 */
@Table("roles")
export class Role extends Model {
    @Primary() @StringColumn() id!: string;
    @StringColumn() name!: string;
    /** Mirrors Spatie's guard_name — which auth guard/token type this role applies to. Defaults to "api" (this framework's default JWT guard) if omitted. */
    @StringColumn() guardName!: string;
    /** Populated only for team-scoped roles (Spatie's "teams" feature). Left undefined/null for a global role shared across every team/tenant. See this file's top-level comment for why this is `teamId`, not `tenantId`. */
    @StringColumn() teamId?: string;
    @TimestampColumn() createdAt!: Date;
    @TimestampColumn() updatedAt!: Date;

    @BelongsToMany(() => Permission, {
        pivotTable: "role_has_permissions",
        foreignKey: "roleId",
        relatedPivotKey: "permissionId",
    })
    permissions?: Permission[];
}

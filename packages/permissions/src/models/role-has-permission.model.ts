import { Model, Table, Primary, StringColumn } from "@nyalajs/database";

/**
 * Pivot row: one permission attached to one role. Backs the
 * Role<->Permission @BelongsToMany declared on both Role and Permission
 * (see role.model.ts/permission.model.ts) for READS; RoleService uses this
 * Model directly for WRITES (attach/detach/sync), since @BelongsToMany's
 * RelationLoader only knows how to read a pivot table, not write to one.
 */
@Table("role_has_permissions")
export class RoleHasPermission extends Model {
    @Primary() @StringColumn() id!: string;
    @StringColumn() roleId!: string;
    @StringColumn() permissionId!: string;
}

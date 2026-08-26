import { Model, Table, Primary, StringColumn, TimestampColumn, BelongsToMany } from "@nyalajs/database";
import { Role } from "./role.model";

/**
 * A single named capability (e.g. "posts.create", "posts.*"). Mirrors
 * Spatie's `Permission` model. `name` + `guardName` are unique together.
 *
 * Wildcard permissions (a feature base Spatie laravel-permission does NOT
 * have — see PermissionMatcher) are just permission rows whose `name` ends
 * in `.*` or is exactly `*`; nothing special about the row itself, the
 * matching logic lives in PermissionMatcher.
 */
@Table("permissions")
export class Permission extends Model {
    @Primary() @StringColumn() id!: string;
    @StringColumn() name!: string;
    @StringColumn() guardName!: string;
    @TimestampColumn() createdAt!: Date;
    @TimestampColumn() updatedAt!: Date;

    @BelongsToMany(() => Role, {
        pivotTable: "role_has_permissions",
        foreignKey: "permissionId",
        relatedPivotKey: "roleId",
    })
    roles?: Role[];
}

import { Model, Table, Primary, StringColumn } from "@nyalajs/database";

/**
 * Pivot row: one permission granted DIRECTLY to a model instance, bypassing
 * roles entirely. Mirrors Spatie's `model_has_permissions` — the mechanism
 * behind `givePermissionTo()` being usable on a User directly, not just on
 * a Role. Same polymorphic (modelType/modelId) and team-scoping shape as
 * ModelHasRole (see that file's comment for why the column is `teamId`,
 * not `tenantId`).
 */
@Table("model_has_permissions")
export class ModelHasPermission extends Model {
    @Primary() @StringColumn() id!: string;
    @StringColumn() permissionId!: string;
    @StringColumn() modelType!: string;
    @StringColumn() modelId!: string;
    @StringColumn() teamId?: string;
}

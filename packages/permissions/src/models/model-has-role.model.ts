import { Model, Table, Primary, StringColumn } from "@nyalajs/database";

/**
 * Pivot row: one role assigned to one model instance. Polymorphic — like
 * Spatie's `model_has_roles` — `modelType` + `modelId` identify the
 * assignee, so roles can be assigned to any model (User, ApiClient, Team...),
 * not just a hardcoded User table. `teamId` is populated only when the
 * *assignment itself* is team-scoped (see README "Teams"); a global role
 * assigned within a team context still gets a teamId here even though the
 * Role row itself has none, matching Spatie's teams behavior where the
 * pivot table — not the role — carries the team_id. (Named `teamId`, not
 * `tenantId` — see role.model.ts's top comment for why.)
 *
 * Has its own @Primary() id (unlike Spatie's composite-PK model_has_roles
 * table) purely so Model's instance .save()/.delete() work normally — the
 * REAL uniqueness constraint enforced at the DB level is the
 * (roleId, modelType, modelId, teamId) tuple, via a composite UNIQUE
 * index in the migration, not the id.
 */
@Table("model_has_roles")
export class ModelHasRole extends Model {
    @Primary() @StringColumn() id!: string;
    @StringColumn() roleId!: string;
    @StringColumn() modelType!: string;
    @StringColumn() modelId!: string;
    @StringColumn() teamId?: string;
}

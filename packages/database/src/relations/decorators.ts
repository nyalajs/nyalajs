import "reflect-metadata";
import { Type } from "@nyalajs/core";

export const RELATION_METADATA = "nyala:database:relations";

export type RelationKind = "hasMany" | "hasOne" | "belongsTo" | "belongsToMany";

export interface RelationDefinition {
    kind: RelationKind;
    /** The property this relation is declared on (e.g. "posts" on User). */
    property: string;
    /** Deferred so two models can reference each other without an import cycle at module-load time. */
    related: () => Type;
    /**
     * The foreign key column (model property name, not DB column name).
     * hasMany/hasOne: the FK lives on the *related* table, pointing back at this model (e.g. Post.userId).
     * belongsTo: the FK lives on *this* table, pointing at the related model (e.g. Post.userId, declared on Post).
     * belongsToMany: the column on the pivot table pointing at *this* model.
     */
    foreignKey: string;
    /**
     * The key on the owning side that `foreignKey` references. Defaults to
     * the model's `@Primary()` column ("id" in the common case) for
     * hasMany/hasOne/belongsTo. Required for belongsToMany (see pivot below).
     */
    localKey?: string;
    /** belongsToMany only: the pivot/join table name. */
    pivotTable?: string;
    /** belongsToMany only: the column on the pivot table pointing at the *related* model. */
    relatedPivotKey?: string;
}

function addRelation(target: any, def: RelationDefinition): void {
    const relations: Map<string, RelationDefinition> =
        Reflect.getMetadata(RELATION_METADATA, target.constructor) ?? new Map();
    relations.set(def.property, def);
    Reflect.defineMetadata(RELATION_METADATA, relations, target.constructor);
}

/**
 * One-to-many: the foreign key lives on the *related* table.
 *
 * @example
 *   @Table("users")
 *   class User extends Model {
 *     @Primary() @StringColumn() id!: string;
 *
 *     @HasMany(() => Post, "userId")
 *     posts?: Post[];
 *   }
 */
export function HasMany(related: () => Type, foreignKey: string, localKey?: string): PropertyDecorator {
    return (target, propertyKey) => {
        addRelation(target, {
            kind: "hasMany",
            property: propertyKey.toString(),
            related,
            foreignKey,
            localKey,
        });
    };
}

/**
 * One-to-one: same shape as HasMany, but resolves (and eager-loads) a single
 * related record instead of an array.
 */
export function HasOne(related: () => Type, foreignKey: string, localKey?: string): PropertyDecorator {
    return (target, propertyKey) => {
        addRelation(target, {
            kind: "hasOne",
            property: propertyKey.toString(),
            related,
            foreignKey,
            localKey,
        });
    };
}

/**
 * Inverse of HasMany/HasOne: the foreign key lives on *this* table, pointing
 * at the related model.
 *
 * @example
 *   @Table("posts")
 *   class Post extends Model {
 *     @Primary() @StringColumn() id!: string;
 *     @StringColumn() userId!: string;
 *
 *     @BelongsTo(() => User, "userId")
 *     author?: User;
 *   }
 */
export function BelongsTo(related: () => Type, foreignKey: string, localKey?: string): PropertyDecorator {
    return (target, propertyKey) => {
        addRelation(target, {
            kind: "belongsTo",
            property: propertyKey.toString(),
            related,
            foreignKey,
            localKey,
        });
    };
}

/**
 * Many-to-many via a pivot table.
 *
 * @example
 *   @Table("users")
 *   class User extends Model {
 *     @Primary() @StringColumn() id!: string;
 *
 *     @BelongsToMany(() => Role, {
 *       pivotTable: "user_roles",
 *       foreignKey: "userId",       // column on user_roles pointing at User
 *       relatedPivotKey: "roleId",  // column on user_roles pointing at Role
 *     })
 *     roles?: Role[];
 *   }
 */
export function BelongsToMany(
    related: () => Type,
    options: { pivotTable: string; foreignKey: string; relatedPivotKey: string; localKey?: string }
): PropertyDecorator {
    return (target, propertyKey) => {
        addRelation(target, {
            kind: "belongsToMany",
            property: propertyKey.toString(),
            related,
            foreignKey: options.foreignKey,
            localKey: options.localKey,
            pivotTable: options.pivotTable,
            relatedPivotKey: options.relatedPivotKey,
        });
    };
}

export function getRelations(modelClass: any): Map<string, RelationDefinition> {
    return Reflect.getMetadata(RELATION_METADATA, modelClass) ?? new Map();
}

export function getRelation(modelClass: any, property: string): RelationDefinition | undefined {
    return getRelations(modelClass).get(property);
}

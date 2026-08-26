import {
    GraphQLBoolean,
    GraphQLFloat,
    GraphQLID,
    GraphQLInt,
    GraphQLList,
    GraphQLNonNull,
    GraphQLOutputType,
    GraphQLInputType,
    GraphQLScalarType,
    GraphQLString,
} from "graphql";

/**
 * A GraphQL ID scalar, distinct from a plain string, for fields declared
 * `@Field(() => ID)`. Serializes/parses identically to the built-in ID type
 * (round-trips through String) — this is a marker class, not a real scalar
 * implementation, resolved to the actual `GraphQLID` in mapScalar().
 */
export class ID {
    private constructor() {}
}

/** Marker for `@Field(() => Int)` — TS `number` alone is ambiguous between GraphQL Int and Float. */
export class Int {
    private constructor() {}
}

/** Marker for `@Field(() => Float)`, the default numeric type when unspecified. */
export class Float {
    private constructor() {}
}

export type TypeThunk = () => any;

export interface FieldTypeOptions {
    nullable?: boolean;
    list?: boolean;
    /** Only meaningful with list: true — whether individual list items may be null. Default false. */
    nullableItems?: boolean;
}

const scalarMap = new Map<any, GraphQLScalarType>([
    [String, GraphQLString],
    [Boolean, GraphQLBoolean],
    [Number, GraphQLFloat],
    [ID, GraphQLID],
    [Int, GraphQLInt],
    [Float, GraphQLFloat],
]);

export function isKnownScalar(type: any): boolean {
    return scalarMap.has(type);
}

export function resolveScalar(type: any): GraphQLScalarType | undefined {
    return scalarMap.get(type);
}

/**
 * Wraps a resolved leaf GraphQL type (scalar or object/input type already
 * built) with List/NonNull per FieldTypeOptions. Shared by both the output
 * (@ObjectType/@Field) and input (@InputType/@Field) builders since the
 * nullability/list algebra is identical for both.
 */
export function wrapType<T extends GraphQLOutputType | GraphQLInputType>(
    leaf: T,
    options: FieldTypeOptions
): T {
    let type: any = leaf;
    if (options.list) {
        if (!options.nullableItems) {
            type = new GraphQLNonNull(type);
        }
        type = new GraphQLList(type);
    }
    if (!options.nullable) {
        type = new GraphQLNonNull(type);
    }
    return type;
}

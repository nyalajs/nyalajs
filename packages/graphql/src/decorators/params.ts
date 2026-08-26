import "reflect-metadata";
import { NYALA_GQL_ARGS } from "../constants/metadata-keys";
import { TypeThunk } from "../schema/type-mapping";

export enum GqlParamType {
    ARGS = "args",
    SINGLE_ARG = "single-arg",
    CONTEXT = "context",
    PARENT = "parent",
    INFO = "info",
}

export interface GqlParamMetadata {
    index: number;
    type: GqlParamType;
    /** For SINGLE_ARG: the GraphQL argument name to pull out of the args object. */
    argName?: string;
    /** For SINGLE_ARG: required to build the argument's schema type (same reason @Field() needs a thunk). */
    typeThunk?: TypeThunk;
    nullable?: boolean;
}

function pushParam(target: any, propertyKey: string | symbol, index: number, meta: Omit<GqlParamMetadata, "index">): void {
    const ctor = target.constructor;
    const existing: GqlParamMetadata[] = Reflect.getMetadata(NYALA_GQL_ARGS, ctor, propertyKey) ?? [];
    existing.push({ index, ...meta });
    Reflect.defineMetadata(NYALA_GQL_ARGS, existing, ctor, propertyKey);
}

/**
 * The full GraphQL arguments object for this field, as a plain object (or,
 * when `argName` is given, one named argument pulled out of it — e.g.
 * `@Args("id", () => ID) id: string` for `field(id: ID!)`).
 */
export function Args(argName?: string, typeThunk?: TypeThunk, options: { nullable?: boolean } = {}): ParameterDecorator {
    return (target, propertyKey, index) => {
        if (propertyKey === undefined) return;
        if (argName === undefined) {
            pushParam(target, propertyKey, index, { type: GqlParamType.ARGS });
        } else {
            pushParam(target, propertyKey, index, {
                type: GqlParamType.SINGLE_ARG,
                argName,
                typeThunk,
                nullable: options.nullable ?? false,
            });
        }
    };
}

/** The GraphqlExecutionContext for this operation — request, container, tenant/trace info. */
export function Ctx(): ParameterDecorator {
    return (target, propertyKey, index) => {
        if (propertyKey === undefined) return;
        pushParam(target, propertyKey, index, { type: GqlParamType.CONTEXT });
    };
}

/** The parent object, for a @ResolveField() resolving one field of an @ObjectType(). */
export function Parent(): ParameterDecorator {
    return (target, propertyKey, index) => {
        if (propertyKey === undefined) return;
        pushParam(target, propertyKey, index, { type: GqlParamType.PARENT });
    };
}

/** The raw graphql-js GraphQLResolveInfo, for the rare resolver that needs it (e.g. to inspect requested sub-selections). */
export function Info(): ParameterDecorator {
    return (target, propertyKey, index) => {
        if (propertyKey === undefined) return;
        pushParam(target, propertyKey, index, { type: GqlParamType.INFO });
    };
}

export function getGqlParamMetadata(target: any, propertyKey: string | symbol): GqlParamMetadata[] {
    return Reflect.getMetadata(NYALA_GQL_ARGS, target, propertyKey) ?? [];
}

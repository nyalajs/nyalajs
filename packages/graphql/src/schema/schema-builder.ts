import { Kernel, Type } from "@nyalajs/core";
import {
    GraphQLFieldConfigMap,
    GraphQLInputFieldConfigMap,
    GraphQLInputObjectType,
    GraphQLObjectType,
    GraphQLOutputType,
    GraphQLInputType,
    GraphQLSchema,
} from "graphql";
import { getFieldsMetadata, getInputTypeMetadata, getObjectTypeMetadata, FieldMetadata } from "../decorators/object-type";
import {
    getFieldResolversMetadata,
    getOperationsMetadata,
    getResolverMetadata,
    FieldResolverMetadata,
    OperationMetadata,
} from "../decorators/resolver";
import { isKnownScalar, resolveScalar, wrapType } from "./type-mapping";
import { GraphqlFieldDispatcher } from "../execution/field-dispatcher";
import { buildArgsConfig } from "./args-builder";

export interface BuildSchemaOptions {
    /** @ObjectType()/@InputType() classes referenced only via other classes' fields don't need to be listed here — only ones that would otherwise be unreachable from a root Query/Mutation/Subscription type (rare). */
    orphanedTypes?: Type[];
    resolvers: Type[];
}

/**
 * Builds a real graphql-js GraphQLSchema from @ObjectType()/@InputType()/
 * @Resolver() decorated classes, resolving every field through the same
 * Kernel/Container DI every other Nyala transport uses. Class-to-GraphQLType
 * resolution is memoized per class (objectTypeCache/inputTypeCache) both for
 * performance and because graphql-js requires each named type to be a single
 * object identity — reusing the same User class twice must produce the same
 * GraphQLObjectType, not two structurally-identical-but-distinct ones (which
 * graphql-js rejects at schema-build time as a duplicate type name).
 */
export class GraphqlSchemaBuilder {
    private objectTypeCache = new Map<Type, GraphQLObjectType>();
    private inputTypeCache = new Map<Type, GraphQLInputObjectType>();
    /**
     * The full resolver-class list for the schema currently being built, set
     * once at the top of build() and read by every toObjectType() call this
     * builder makes for the rest of that build — including calls reached
     * indirectly through toOutputType()/toInputType() (e.g. a @Query()'s
     * return type), which have no other way to reach the resolver list.
     * Threading it as a parameter through every one of those call sites
     * previously meant a couple of paths silently passed `[]` instead of the
     * real list, silently dropping @ResolveField() registration for any
     * @ObjectType() first reached that way — this instance field removes
     * that whole class of mistake.
     */
    private resolvers: Type[] = [];

    constructor(private readonly kernel: Kernel) {}

    build(options: BuildSchemaOptions): GraphQLSchema {
        this.resolvers = options.resolvers;
        const queryFields: GraphQLFieldConfigMap<any, any> = {};
        const mutationFields: GraphQLFieldConfigMap<any, any> = {};
        const subscriptionFields: GraphQLFieldConfigMap<any, any> = {};

        for (const ResolverClass of options.resolvers) {
            const resolverMeta = getResolverMetadata(ResolverClass);
            const operations = getOperationsMetadata(ResolverClass);

            for (const op of operations) {
                const dispatcher = new GraphqlFieldDispatcher(this.kernel, ResolverClass, op.handlerName, op.kind, op.name);

                if (op.kind === "query" || op.kind === "mutation") {
                    const fieldConfig = {
                        type: this.resolveOperationReturnType(op),
                        args: buildArgsConfig(ResolverClass, op.handlerName, (t) => this.toInputType(t)),
                        description: op.description,
                        resolve: (parent: any, args: any, ctx: any, info: any) => dispatcher.resolve(parent, args, ctx, info),
                    };
                    if (op.kind === "query") queryFields[op.name] = fieldConfig;
                    else mutationFields[op.name] = fieldConfig;
                } else if (op.kind === "subscription") {
                    // Subscriptions have a different resolver shape than
                    // query/mutation: `subscribe` is what actually runs the
                    // guard->interceptor->handler pipeline ONCE to produce
                    // the AsyncIterable (going through the full dispatcher,
                    // since a subscribe call is itself one "operation" that
                    // should be guarded/intercepted like any other); `resolve`
                    // then runs on EVERY value that iterable yields, and must
                    // NOT re-invoke the handler — it only shapes the already-
                    // produced payload into the field's value. Wiring
                    // `resolve` to the dispatcher here (as query/mutation do)
                    // would call the handler again per event instead of
                    // reading what was yielded, silently resolving every
                    // event to null for a resolver method like `async
                    // *ticks()` that returns an AsyncGenerator, not a scalar.
                    // When a separate `subscribe` method is named (options.subscribe
                    // on @Subscription()), it's the one actually invoked to
                    // produce the AsyncIterable and gets its own dispatcher
                    // (its own guards/interceptors, keyed by ITS handler name)
                    // — the decorated method itself is then just the resolve
                    // step below (payload => payload, i.e. never called with
                    // its own body since resolve is fixed). Otherwise (the
                    // common case) the decorated method IS the subscribe
                    // step, reusing `dispatcher` from above.
                    const subscribeDispatcher = op.subscribeHandlerName
                        ? new GraphqlFieldDispatcher(this.kernel, ResolverClass, op.subscribeHandlerName, op.kind, op.name)
                        : dispatcher;

                    subscriptionFields[op.name] = {
                        type: this.resolveOperationReturnType(op),
                        args: buildArgsConfig(ResolverClass, op.handlerName, (t) => this.toInputType(t)),
                        description: op.description,
                        subscribe: (parent: any, args: any, ctx: any, info: any) =>
                            subscribeDispatcher.resolve(parent, args, ctx, info),
                        resolve: (payload: any) => payload,
                    };
                }
            }

            // Field resolvers (@ResolveField()) attach onto an @ObjectType()'s
            // GraphQLObjectType lazily, via that type's own field thunk (see
            // toObjectType) — nothing to do here at the resolver-class level
            // beyond making sure the type gets built at least once so its
            // fields (including these overrides) are registered. ofType is
            // optional and only used for this purpose.
            if (resolverMeta?.ofType) {
                this.toObjectType(resolverMeta.ofType() as Type);
            }
        }

        for (const OrphanClass of options.orphanedTypes ?? []) {
            this.toObjectType(OrphanClass);
        }

        return new GraphQLSchema({
            query: Object.keys(queryFields).length > 0 ? new GraphQLObjectType({ name: "Query", fields: queryFields }) : undefined,
            mutation: Object.keys(mutationFields).length > 0 ? new GraphQLObjectType({ name: "Mutation", fields: mutationFields }) : undefined,
            subscription:
                Object.keys(subscriptionFields).length > 0
                    ? new GraphQLObjectType({ name: "Subscription", fields: subscriptionFields })
                    : undefined,
        });
    }

    private resolveOperationReturnType(op: OperationMetadata): GraphQLOutputType {
        if (!op.returnTypeThunk) {
            throw new Error(
                `[nyala/graphql] Operation "${op.name}" has no return type — pass one explicitly, ` +
                `e.g. @Query(() => [User]) or @Mutation(() => Boolean).`
            );
        }
        const raw = op.returnTypeThunk();
        return this.toOutputType(raw, { nullable: op.nullable, list: op.list });
    }

    /**
     * Resolves any type reference (scalar class, @ObjectType() class,
     * already-built GraphQL type, or a `[Type]` array-literal shorthand) to a
     * GraphQLOutputType, applying List/NonNull per the field's options.
     *
     * The `() => [User]` array-literal form (TypeGraphQL's own convention,
     * used because a bare `() => User[]` thunk can't be distinguished from
     * `() => User` at the type level once erased) is unwrapped here rather
     * than requiring callers to also pass `{ list: true }` — `list` in
     * FieldTypeOptions is still honored on its own for callers that prefer
     * spelling it out explicitly (e.g. type aliases that already resolve to
     * a bare class).
     */
    toOutputType(raw: any, options: { nullable?: boolean; list?: boolean; nullableItems?: boolean } = {}): GraphQLOutputType {
        const { leaf: rawLeaf, list } = this.unwrapArrayLiteral(raw, options.list ?? false);
        let leaf: GraphQLOutputType;
        if (rawLeaf && typeof rawLeaf.toConfig === "function") {
            // Already a graphql-js type instance (e.g. passed straight through).
            leaf = rawLeaf;
        } else if (isKnownScalar(rawLeaf)) {
            leaf = resolveScalar(rawLeaf)!;
        } else {
            leaf = this.toObjectType(rawLeaf as Type);
        }
        return wrapType(leaf, { nullable: options.nullable ?? false, list, nullableItems: options.nullableItems ?? false });
    }

    toInputType(raw: any, options: { nullable?: boolean; list?: boolean; nullableItems?: boolean } = {}): GraphQLInputType {
        const { leaf: rawLeaf, list } = this.unwrapArrayLiteral(raw, options.list ?? false);
        let leaf: GraphQLInputType;
        if (rawLeaf && typeof rawLeaf.toConfig === "function") {
            leaf = rawLeaf;
        } else if (isKnownScalar(rawLeaf)) {
            leaf = resolveScalar(rawLeaf)!;
        } else {
            leaf = this.toInputObjectType(rawLeaf as Type);
        }
        return wrapType(leaf, { nullable: options.nullable ?? false, list, nullableItems: options.nullableItems ?? false });
    }

    private unwrapArrayLiteral(raw: any, explicitList: boolean): { leaf: any; list: boolean } {
        if (Array.isArray(raw)) {
            return { leaf: raw[0], list: true };
        }
        return { leaf: raw, list: explicitList };
    }

    private toObjectType(target: Type): GraphQLObjectType {
        const cached = this.objectTypeCache.get(target);
        if (cached) return cached;

        const meta = getObjectTypeMetadata(target);
        if (!meta) {
            throw new Error(`[nyala/graphql] "${(target as any)?.name ?? String(target)}" is used as a GraphQL type but has no @ObjectType() decorator.`);
        }

        const fields = getFieldsMetadata(target);

        // @ResolveField() entries from ANY resolver that declared
        // @Resolver(() => target) — collected once here rather than
        // requiring the caller to pass just one resolver class, since
        // multiple resolver classes can legitimately extend the same type
        // (e.g. splitting a large type's field resolvers across files).
        // Each entry either OVERRIDES a field target already declares via
        // @Field() (matched by name, below) or ADDS a new field the class
        // has no property for at all (the common case — e.g. Post.author
        // computed from Post.authorId).
        const fieldResolvers = new Map<string, { resolverClass: Type; meta: FieldResolverMetadata }>();
        for (const ResolverClass of this.resolvers) {
            const resolverMeta = getResolverMetadata(ResolverClass);
            if (!resolverMeta?.ofType) continue;
            if ((resolverMeta.ofType() as Type) !== target) continue;
            for (const fr of getFieldResolversMetadata(ResolverClass)) {
                fieldResolvers.set(fr.name, { resolverClass: ResolverClass, meta: fr });
            }
        }

        // Placeholder registered BEFORE fields are built, so a self-referential
        // or mutually-referential @ObjectType() (e.g. User.posts -> Post.author
        // -> User) resolves back to this same instance instead of recursing
        // forever / building a duplicate.
        const objectType: GraphQLObjectType = new GraphQLObjectType({
            name: meta.name,
            description: meta.description,
            fields: () => this.buildOutputFields(fields, fieldResolvers),
        });
        this.objectTypeCache.set(target, objectType);
        return objectType;
    }

    private buildOutputFields(
        fields: FieldMetadata[],
        fieldResolvers: Map<string, { resolverClass: Type; meta: FieldResolverMetadata }>
    ): GraphQLFieldConfigMap<any, any> {
        const result: GraphQLFieldConfigMap<any, any> = {};
        const consumed = new Set<string>();

        for (const field of fields) {
            const fieldResolver = fieldResolvers.get(field.propertyKey);
            const type = this.toOutputType(field.typeThunk(), field.options);

            if (fieldResolver) {
                consumed.add(field.propertyKey);
                const dispatcher = new GraphqlFieldDispatcher(this.kernel, fieldResolver.resolverClass, fieldResolver.meta.handlerName, "field", field.propertyKey);
                result[field.propertyKey] = {
                    type,
                    description: field.description,
                    resolve: (parent: any, args: any, ctx: any, info: any) => dispatcher.resolve(parent, args, ctx, info),
                };
            } else {
                // Plain property access — graphql-js's default resolver
                // already does this (reads `parent[fieldName]`), so no
                // custom resolve function is needed for the common case.
                result[field.propertyKey] = { type, description: field.description };
            }
        }

        // @ResolveField() entries that didn't match an existing @Field() —
        // i.e. fields the plain data class has no property for at all
        // (Post.author, computed from Post.authorId). These need their own
        // return type thunk since there's no @Field() declaration to source
        // one from.
        for (const [name, fieldResolver] of fieldResolvers) {
            if (consumed.has(name)) continue;
            if (!fieldResolver.meta.returnTypeThunk) {
                throw new Error(
                    `[nyala/graphql] @ResolveField() "${name}" on "${fieldResolver.resolverClass.name}" adds a field ` +
                    `not declared by @Field() on the target type, so it needs its own return type, ` +
                    `e.g. @ResolveField(() => User).`
                );
            }
            const dispatcher = new GraphqlFieldDispatcher(this.kernel, fieldResolver.resolverClass, fieldResolver.meta.handlerName, "field", name);
            result[name] = {
                type: this.toOutputType(fieldResolver.meta.returnTypeThunk(), { nullable: fieldResolver.meta.nullable, list: fieldResolver.meta.list }),
                description: fieldResolver.meta.description,
                resolve: (parent: any, args: any, ctx: any, info: any) => dispatcher.resolve(parent, args, ctx, info),
            };
        }

        return result;
    }

    private toInputObjectType(target: Type): GraphQLInputObjectType {
        const cached = this.inputTypeCache.get(target);
        if (cached) return cached;

        const meta = getInputTypeMetadata(target);
        if (!meta) {
            throw new Error(`[nyala/graphql] "${(target as any)?.name ?? String(target)}" is used as a GraphQL input type but has no @InputType() decorator.`);
        }

        const fields = getFieldsMetadata(target);

        const inputType: GraphQLInputObjectType = new GraphQLInputObjectType({
            name: meta.name,
            description: meta.description,
            fields: () => this.buildInputFields(fields),
        });
        this.inputTypeCache.set(target, inputType);
        return inputType;
    }

    private buildInputFields(fields: FieldMetadata[]): GraphQLInputFieldConfigMap {
        const result: GraphQLInputFieldConfigMap = {};
        for (const field of fields) {
            result[field.propertyKey] = {
                type: this.toInputType(field.typeThunk(), field.options),
                description: field.description,
            };
        }
        return result;
    }
}

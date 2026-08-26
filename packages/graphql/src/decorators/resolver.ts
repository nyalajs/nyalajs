import "reflect-metadata";
import { NYALA_GQL_RESOLVER, NYALA_GQL_OPERATIONS, NYALA_GQL_FIELD_RESOLVERS } from "../constants/metadata-keys";
import { TypeThunk } from "../schema/type-mapping";

export type OperationKind = "query" | "mutation" | "subscription";

export interface OperationMetadata {
    kind: OperationKind;
    handlerName: string;
    /** GraphQL field name; defaults to the method name. */
    name: string;
    returnTypeThunk?: TypeThunk;
    nullable: boolean;
    list: boolean;
    description?: string;
    /**
     * Only for kind: "subscription" — an AsyncIterable factory the executor
     * subscribes to; the method itself (if present) becomes the resolve/filter
     * step, mirroring graphql-js's subscribe/resolve split. If omitted, the
     * handler method itself must return an AsyncIterable.
     */
    subscribeHandlerName?: string;
}

export interface ResolverMetadata {
    /** The @ObjectType() class this resolver's @ResolveField()s attach to, if any. */
    ofType?: TypeThunk;
}

/**
 * Marks a class as a GraphQL resolver, resolved through the same DI
 * container every @Controller() and microservices handler uses. `ofType`
 * is only needed when the resolver also declares @ResolveField() methods
 * (field-level resolvers for a specific @ObjectType()); a resolver that
 * only has @Query()/@Mutation()/@Subscription() methods can omit it.
 */
export function Resolver(ofType?: TypeThunk): ClassDecorator {
    return (target) => {
        Reflect.defineMetadata(NYALA_GQL_RESOLVER, { ofType } as ResolverMetadata, target);
    };
}

export interface OperationOptions {
    name?: string;
    nullable?: boolean;
    list?: boolean;
    description?: string;
}

function pushOperation(target: any, propertyKey: string | symbol, meta: OperationMetadata): void {
    const ctor = target.constructor;
    const operations: OperationMetadata[] = Reflect.getMetadata(NYALA_GQL_OPERATIONS, ctor) ?? [];
    operations.push(meta);
    Reflect.defineMetadata(NYALA_GQL_OPERATIONS, operations, ctor);
}

export function Query(returnTypeThunk?: TypeThunk, options: OperationOptions = {}): MethodDecorator {
    return (target, propertyKey) => {
        pushOperation(target, propertyKey, {
            kind: "query",
            handlerName: propertyKey as string,
            name: options.name ?? (propertyKey as string),
            returnTypeThunk,
            nullable: options.nullable ?? false,
            list: options.list ?? false,
            description: options.description,
        });
    };
}

export function Mutation(returnTypeThunk?: TypeThunk, options: OperationOptions = {}): MethodDecorator {
    return (target, propertyKey) => {
        pushOperation(target, propertyKey, {
            kind: "mutation",
            handlerName: propertyKey as string,
            name: options.name ?? (propertyKey as string),
            returnTypeThunk,
            nullable: options.nullable ?? false,
            list: options.list ?? false,
            description: options.description,
        });
    };
}

export interface SubscriptionOptions extends OperationOptions {
    /** Name of a sibling method on the same class returning an AsyncIterable — the subscribe step. Defaults to the decorated method's own name (it returns the AsyncIterable directly, with no separate filter/resolve step). */
    subscribe?: string;
}

export function Subscription(returnTypeThunk?: TypeThunk, options: SubscriptionOptions = {}): MethodDecorator {
    return (target, propertyKey) => {
        pushOperation(target, propertyKey, {
            kind: "subscription",
            handlerName: propertyKey as string,
            name: options.name ?? (propertyKey as string),
            returnTypeThunk,
            nullable: options.nullable ?? false,
            list: options.list ?? false,
            description: options.description,
            subscribeHandlerName: options.subscribe,
        });
    };
}

export interface FieldResolverMetadata {
    handlerName: string;
    /** GraphQL field name on the parent @ObjectType(); defaults to the method name. */
    name: string;
    /**
     * Required when this field isn't already declared via @Field() on the
     * target @ObjectType() (the common case — e.g. Post has no `author`
     * property at all, only an `authorId`; the resolver method is the only
     * source of that field's existence, so nothing else can supply its
     * type). Optional when overriding a field @ObjectType() already
     * declares with @Field() — that declaration's type is reused instead.
     */
    returnTypeThunk?: TypeThunk;
    nullable: boolean;
    list: boolean;
    description?: string;
}

export interface ResolveFieldOptions {
    name?: string;
    nullable?: boolean;
    list?: boolean;
    description?: string;
}

/**
 * Resolves one field of the @ObjectType() named by this resolver class's
 * @Resolver(() => Type) — either overriding a field already declared with
 * @Field() (e.g. batching a relation via DataLoader instead of it being a
 * plain property), or adding an entirely new field the @ObjectType() itself
 * has no property for (the common case: `Post.author` computed from
 * `Post.authorId`). A return type thunk is required unless overriding an
 * already-@Field()-declared field, since there's otherwise nothing to infer
 * the field's type from.
 */
export function ResolveField(returnTypeThunk?: TypeThunk, options: ResolveFieldOptions = {}): MethodDecorator {
    return (target, propertyKey) => {
        const ctor = target.constructor;
        const resolvers: FieldResolverMetadata[] = Reflect.getMetadata(NYALA_GQL_FIELD_RESOLVERS, ctor) ?? [];
        resolvers.push({
            handlerName: propertyKey as string,
            name: options.name ?? (propertyKey as string),
            returnTypeThunk,
            nullable: options.nullable ?? false,
            list: options.list ?? false,
            description: options.description,
        });
        Reflect.defineMetadata(NYALA_GQL_FIELD_RESOLVERS, resolvers, ctor);
    };
}

export function getResolverMetadata(target: any): ResolverMetadata | undefined {
    return Reflect.getMetadata(NYALA_GQL_RESOLVER, target);
}

export function getOperationsMetadata(target: any): OperationMetadata[] {
    return Reflect.getMetadata(NYALA_GQL_OPERATIONS, target) ?? [];
}

export function getFieldResolversMetadata(target: any): FieldResolverMetadata[] {
    return Reflect.getMetadata(NYALA_GQL_FIELD_RESOLVERS, target) ?? [];
}

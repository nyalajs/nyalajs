import { Container, Type } from "@nyalajs/core";
import { GraphQLResolveInfo } from "graphql";
import { GraphqlContext } from "./graphql-context";

export type { GraphqlContext };

/** Passed to Guards/Interceptors/Filters wrapping one field resolution — the GraphQL analog of MicroserviceExecutionContext / HTTP's ExecutionContext. */
export interface GraphqlExecutionContext {
    /** Parsed GraphQL arguments for this field. */
    args: any;
    /** The parent/source object graphql-js passes to the resolver. */
    parent: any;
    ctx: GraphqlContext;
    info: GraphQLResolveInfo;
    container: Container;
    resolverClass: Type;
    handlerName: string;
    /** "query" | "mutation" | "subscription" | "field" (a @ResolveField() on a plain @ObjectType()). */
    operationKind: "query" | "mutation" | "subscription" | "field";
}

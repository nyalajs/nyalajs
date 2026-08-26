import { GraphqlExecutionContext } from "../context/graphql-execution-context";

/**
 * Same shape as HTTP's/microservices' exception filter. Pair with @Catch()
 * from @nyalajs/core (shared metadata, same as guards/interceptors). A
 * filter's `catch()` return value becomes the field's resolved value
 * (typically null for a nullable field, or a GraphQLError is thrown instead
 * if the filter re-throws) — graphql-js reports it as a partial result with
 * an `errors` entry rather than failing the whole response.
 */
export interface GraphqlExceptionFilter {
    catch(error: Error, context: GraphqlExecutionContext): any;
}

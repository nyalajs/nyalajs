import { GraphqlExecutionContext } from "../context/graphql-execution-context";

/**
 * Same contract as @nyalajs/http's Guard and @nyalajs/microservices'
 * MicroserviceGuard, retargeted to GraphqlExecutionContext. A class
 * decorated with @UseGuards() (from @nyalajs/core) works unchanged on a
 * @Resolver() — the dispatcher reads the same NYALA_GUARDS metadata HTTP
 * and microservices read, so one guard implementation can protect a REST
 * route, a message pattern, AND a GraphQL field, as long as it only reads
 * from the parts of ExecutionContext all three shapes have in common
 * (typically just `container`), or is written against GraphqlExecutionContext
 * specifically if it needs GraphQL-only data like `args`/`info`.
 */
export interface GraphqlGuard {
    canActivate(context: GraphqlExecutionContext): Promise<boolean> | boolean;
}

import { GraphqlExecutionContext } from "../context/graphql-execution-context";

/** Same shape as HTTP's Interceptor / microservices' MicroserviceInterceptor, retargeted to GraphqlExecutionContext. Runs around one field's resolution. */
export interface GraphqlInterceptor {
    intercept(context: GraphqlExecutionContext, next: () => Promise<any>): Promise<any>;
}

import { MicroserviceExecutionContext } from "../context/microservice-execution-context";

/** Same contract as @nyalajs/http's Interceptor, applied to message/event handlers. */
export interface MicroserviceInterceptor {
    intercept(
        context: MicroserviceExecutionContext,
        next: () => Promise<any>
    ): Promise<any>;
}

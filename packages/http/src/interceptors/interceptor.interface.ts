import { ExecutionContext } from "../context/execution-context";

export interface Interceptor {
    intercept(
        context: ExecutionContext,
        next: () => Promise<any>
    ): Promise<any>;
}

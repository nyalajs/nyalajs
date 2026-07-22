import { ExecutionContext } from "../context/execution-context";

export interface Guard {
    canActivate(context: ExecutionContext): Promise<boolean> | boolean;
}

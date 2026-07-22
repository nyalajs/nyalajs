import { Container } from "@nyalajs/core";
import { RequestContext } from "./request-context";

export interface ExecutionContext {
    request: any;
    response: any;
    context: RequestContext;
    container: Container;
    route?: any;
}

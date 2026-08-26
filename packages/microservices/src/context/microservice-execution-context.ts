import { Container, Type } from "@nyalajs/core";
import { MicroserviceContext } from "../client/client-proxy";

/**
 * Passed to guards/interceptors/exception filters for a message/event
 * handler — the microservices counterpart to @nyalajs/http's
 * ExecutionContext. There is no request/response pair on a message-pattern
 * transport, so `payload` and `ctx` (pattern/transport/correlation info)
 * stand in for them.
 */
export interface MicroserviceExecutionContext {
    payload: any;
    ctx: MicroserviceContext;
    container: Container;
    controller: Type;
    handlerName: string;
    kind: "message" | "event";
}

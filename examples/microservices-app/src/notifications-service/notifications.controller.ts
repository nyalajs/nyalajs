import { Controller } from "@nyalajs/core";
import { EventPattern, Payload, Ctx, MicroserviceContext } from "@nyalajs/microservices";

@Controller()
export class NotificationsController {
    @EventPattern("order.created")
    onOrderCreated(@Payload() order: { id: string; userId: string }, @Ctx() ctx: MicroserviceContext) {
        // Fire-and-forget: no reply is sent back to whoever emitted this.
        // ctx.trace carries the same requestId/traceId as the gateway
        // request that triggered it, so this log line correlates back to it.
        console.log(
            `[notifications] order ${order.id} created for user ${order.userId} (traceId=${ctx.trace.traceId})`
        );
    }
}

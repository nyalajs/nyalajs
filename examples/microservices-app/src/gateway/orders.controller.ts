import { Controller, Post, Body, Inject } from "@nyalajs/core";
import { ClientProxy } from "@nyalajs/microservices";
import { randomUUID } from "crypto";

@Controller("/orders")
export class OrdersController {
    constructor(@Inject("NOTIFICATIONS_SERVICE") private readonly notifications: ClientProxy) { }

    @Post("/")
    async create(@Body() body: { userId: string }) {
        const order = { id: randomUUID(), userId: body.userId };

        // Fire-and-forget: the gateway doesn't wait on notifications-service
        // to do anything before replying to the HTTP caller.
        await this.notifications.emit("order.created", order);

        return order;
    }
}

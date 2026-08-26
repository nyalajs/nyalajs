import { Module } from "@nyalajs/core";
import { ClientProvider } from "@nyalajs/microservices";
import { UsersController } from "./users.controller";
import { OrdersController } from "./orders.controller";

@Module({
    controllers: [UsersController, OrdersController],
    providers: [
        ClientProvider("USERS_SERVICE", { transport: "tcp", options: { port: 4001 } }),
        ClientProvider("NOTIFICATIONS_SERVICE", {
            transport: "nats",
            options: { servers: process.env.NATS_URL ?? "nats://127.0.0.1:4222" },
        }),
    ],
})
export class GatewayModule { }

import "reflect-metadata";
import { MicroserviceFactory } from "@nyalajs/microservices";
import { NotificationsModule } from "./notifications.module";

async function bootstrap() {
    const app = await MicroserviceFactory.create(NotificationsModule, {
        transport: "nats",
        options: { servers: process.env.NATS_URL ?? "nats://127.0.0.1:4222" },
    });

    app.enableShutdownHooks();
    await app.listen();
    console.log("Notifications microservice listening on NATS (order.created)");
}

bootstrap();

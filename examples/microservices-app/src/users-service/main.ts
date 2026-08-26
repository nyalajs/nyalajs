import "reflect-metadata";
import { MicroserviceFactory } from "@nyalajs/microservices";
import { UsersModule } from "./users.module";

async function bootstrap() {
    const app = await MicroserviceFactory.create(UsersModule, {
        transport: "tcp",
        options: { port: 4001 },
    });

    await app.listen();
    console.log("Users microservice listening on tcp://0.0.0.0:4001");
}

bootstrap();

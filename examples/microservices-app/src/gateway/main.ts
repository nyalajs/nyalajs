import "reflect-metadata";
import { NyalaFactory } from "@nyalajs/core";
import { FastifyAdapter } from "@nyalajs/http";
import { GatewayModule } from "./gateway.module";

async function bootstrap() {
    const app = await NyalaFactory.create(GatewayModule);

    const httpAdapter = new FastifyAdapter(app.getKernel().getContainer(), {
        session: false,
    });
    app.setHttpAdapter(httpAdapter);

    await app.listen(3000);
    console.log("Gateway HTTP server running at http://0.0.0.0:3000");
    console.log("Try: curl http://localhost:3000/users/1");
}

bootstrap();

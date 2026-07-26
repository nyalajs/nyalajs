import "reflect-metadata";
import { NyalaFactory } from "@nyalajs/core";
import { FastifyAdapter } from "@nyalajs/http";
import { AppModule } from "./app.module";

async function bootstrap() {
    const app = await NyalaFactory.create(AppModule);

    const httpAdapter = new FastifyAdapter(app.getKernel().getContainer(), {
        session: false,
    });
    app.setHttpAdapter(httpAdapter);

    await app.listen(3000);
    console.log("Server running at http://0.0.0.0:3000");
}

bootstrap();

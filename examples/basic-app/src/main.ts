import { NyalaFactory } from "@nyala/core";
import { AppModule } from "./app.module";

async function bootstrap() {
    const app = await NyalaFactory.create(AppModule);
    await app.listen(3000);
}

bootstrap();

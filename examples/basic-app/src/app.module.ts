import { Module } from "@nyalajs/core";
import { UsersModule } from "./users/users.module";

@Module({
    imports: [UsersModule],
})
export class AppModule { }

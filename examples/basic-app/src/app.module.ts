import { Module } from "@nyala/core";
import { UsersModule } from "./users/users.module";

@Module({
    imports: [UsersModule],
})
export class AppModule { }

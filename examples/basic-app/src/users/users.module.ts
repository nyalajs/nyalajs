import { Module } from "@nyala/core";
import { UsersService } from "./users.service";
import { UsersController } from "./users.controller";

@Module({
    providers: [UsersService],
    controllers: [UsersController],
    exports: [UsersService],
})
export class UsersModule { }

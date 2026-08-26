import { Controller, Get, Param, Inject } from "@nyalajs/core";
import { ClientProxy } from "@nyalajs/microservices";

@Controller("/users")
export class UsersController {
    constructor(@Inject("USERS_SERVICE") private readonly usersClient: ClientProxy) { }

    @Get("/")
    findAll() {
        return this.usersClient.send("users.findAll", undefined);
    }

    @Get("/:id")
    findOne(@Param("id") id: string) {
        return this.usersClient.send("users.findOne", id);
    }
}

import { Controller, Get } from "@nyala/core";
import { UsersService } from "./users.service";

@Controller("/users")
export class UsersController {
    constructor(private readonly usersService: UsersService) { }

    @Get("/")
    findAll() {
        return this.usersService.findAll();
    }

    @Get("/:id")
    findOne() {
        return this.usersService.findOne(1);
    }
}

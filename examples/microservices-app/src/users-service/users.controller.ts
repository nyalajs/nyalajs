import { Controller } from "@nyalajs/core";
import { MessagePattern, Payload } from "@nyalajs/microservices";
import { UsersService } from "./users.service";

@Controller()
export class UsersController {
    constructor(private readonly usersService: UsersService) { }

    @MessagePattern("users.findOne")
    findOne(@Payload() id: string) {
        return this.usersService.findOne(id);
    }

    @MessagePattern("users.findAll")
    findAll() {
        return this.usersService.findAll();
    }
}

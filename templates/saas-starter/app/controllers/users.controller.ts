import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards } from "@nyalajs/core";
import { ValidateBody } from "@nyalajs/validation";
import { AuthGuard, Roles } from "@nyalajs/security";
import { DBRolesGuard } from "@nyalajs/permissions";
import { UsersService, CreateUserDto, UpdateUserDto } from "../services/users.service";
import { CreateUserValidator, UpdateUserValidator } from "../validators/user.validator";

@Controller("/users")
@UseGuards(AuthGuard, DBRolesGuard)
export class UsersController {
    constructor(private readonly usersService: UsersService) {}

    @Get("/")
    @Roles("owner", "admin")
    async findAll(@Query("page") page: number = 1, @Query("limit") limit: number = 10) {
        return this.usersService.findAll({ page, limit });
    }

    @Get("/:id")
    async findOne(@Param("id") id: string) {
        return this.usersService.findOne(id);
    }

    @Post("/")
    @Roles("owner", "admin")
    @ValidateBody(CreateUserValidator)
    async create(@Body() dto: CreateUserDto) {
        return this.usersService.create(dto);
    }

    @Put("/:id")
    @ValidateBody(UpdateUserValidator)
    async update(@Param("id") id: string, @Body() dto: UpdateUserDto) {
        return this.usersService.update(id, dto);
    }

    @Delete("/:id")
    @Roles("owner", "admin")
    async delete(@Param("id") id: string) {
        return this.usersService.delete(id);
    }
}

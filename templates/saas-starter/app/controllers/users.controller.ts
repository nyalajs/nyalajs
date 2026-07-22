import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards } from "@nyala/core";
import { UsersService } from "../services/users.service";
import { AuthGuard, RolesGuard, Roles } from "@nyala/security";

interface CreateUserDto {
    email: string;
    name: string;
    password: string;
    role?: string;
}

interface UpdateUserDto {
    name?: string;
    email?: string;
    role?: string;
}

@Controller("/users")
@UseGuards(AuthGuard, RolesGuard)
export class UsersController {
    constructor(private usersService: UsersService) { }

    @Get("/")
    @Roles("admin", "superadmin")
    async findAll(
        @Query("page") page: number = 1,
        @Query("limit") limit: number = 10,
    ) {
        return this.usersService.findAll({ page, limit });
    }

    @Get("/:id")
    async findOne(@Param("id") id: string) {
        return this.usersService.findOne(id);
    }

    @Post("/")
    @Roles("admin", "superadmin")
    async create(@Body() dto: CreateUserDto) {
        return this.usersService.create(dto);
    }

    @Put("/:id")
    async update(@Param("id") id: string, @Body() dto: UpdateUserDto) {
        return this.usersService.update(id, dto);
    }

    @Delete("/:id")
    @Roles("admin", "superadmin")
    async delete(@Param("id") id: string) {
        return this.usersService.delete(id);
    }
}

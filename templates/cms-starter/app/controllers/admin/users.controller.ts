import { Controller, Get, Post, Param, Body, Req, Res, UseGuards } from "@nyalajs/core";
import { ValidateBody } from "@nyalajs/validation";
import { view } from "@nyalajs/react";
import { RolesGuard, Roles } from "@nyalajs/security";
import { SessionAuthGuard } from "../../guards/session-auth.guard";
import { UserRepository } from "../../repositories/user.repository";
import { CreateUserValidator, CreateUserDto } from "../../validators/user.validator";
import { UsersPage } from "../../views/admin/users-page";
import { currentUser } from "../../helpers/current-user.helper";
import { hashPassword } from "../../helpers/password.helper";

// Admin-only screen: SessionAuthGuard populates the "user" metadata entry
// RolesGuard/@Roles() expect (see session-auth.guard.ts's docblock). @Roles()
// is a method decorator, so it's repeated per handler, not once on the class.
@Controller("/admin/users")
@UseGuards(SessionAuthGuard, RolesGuard)
export class UsersController {
    constructor(private readonly userRepository: UserRepository) {}

    @Get("/")
    @Roles("admin")
    async index(@Req() req: any) {
        const users = await this.userRepository.findAll();
        return view(UsersPage, {
            user: currentUser(req),
            users: users.map(({ password: _password, ...rest }) => rest),
        });
    }

    @Post("/")
    @Roles("admin")
    @ValidateBody(CreateUserValidator)
    async create(@Body() dto: CreateUserDto, @Req() req: any, @Res() res: any) {
        const exists = await this.userRepository.emailExists(dto.email);
        if (exists) {
            const users = await this.userRepository.findAll();
            return view(UsersPage, {
                user: currentUser(req),
                users: users.map(({ password: _password, ...rest }) => rest),
                error: "Email already exists",
            });
        }

        await this.userRepository.create({
            name: dto.name,
            email: dto.email,
            password: await hashPassword(dto.password),
            role: dto.role,
        } as any);

        return res.redirect(302, "/admin/users");
    }

    @Post("/:id/delete")
    @Roles("admin")
    async delete(@Param("id") id: string, @Res() res: any) {
        await this.userRepository.delete(id);
        return res.redirect(302, "/admin/users");
    }
}

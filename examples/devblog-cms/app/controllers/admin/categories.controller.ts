import { Controller, Get, Post, Param, Query, Body, Req, Res, UseGuards } from "@nyalajs/core";
import { ValidateBody } from "@nyalajs/validation";
import { view } from "@nyalajs/react";
import { SessionAuthGuard } from "../../guards/session-auth.guard";
import { CategoryRepository } from "../../repositories/category.repository";
import { CategoryValidator, CategoryDto } from "../../validators/category.validator";
import { TaxonomyPage } from "../../views/admin/taxonomy-page";
import { currentUser } from "../../helpers/current-user.helper";

@Controller("/admin/categories")
@UseGuards(SessionAuthGuard)
export class CategoriesController {
    constructor(private readonly categoryRepository: CategoryRepository) {}

    @Get("/")
    async index(@Query("edit") editId: string | undefined, @Req() req: any) {
        const [items, editing] = await Promise.all([
            this.categoryRepository.findAll(),
            editId ? this.categoryRepository.findById(editId) : Promise.resolve(null),
        ]);

        return view(TaxonomyPage, {
            user: currentUser(req),
            active: "categories",
            title: "Categories",
            basePath: "/admin/categories",
            items,
            editing: editing ?? undefined,
        });
    }

    @Post("/")
    @ValidateBody(CategoryValidator)
    async create(@Body() dto: CategoryDto, @Res() res: any) {
        await this.categoryRepository.create(dto);
        return res.redirect(302, "/admin/categories");
    }

    @Post("/:id")
    @ValidateBody(CategoryValidator)
    async update(@Param("id") id: string, @Body() dto: CategoryDto, @Res() res: any) {
        await this.categoryRepository.update(id, dto);
        return res.redirect(302, "/admin/categories");
    }

    @Post("/:id/delete")
    async delete(@Param("id") id: string, @Res() res: any) {
        await this.categoryRepository.delete(id);
        return res.redirect(302, "/admin/categories");
    }
}

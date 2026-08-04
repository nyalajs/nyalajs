import { Controller, Get, Post, Param, Query, Body, Req, Res, UseGuards } from "@nyalajs/core";
import { ValidateBody } from "@nyalajs/validation";
import { view } from "@nyalajs/react";
import { SessionAuthGuard } from "../../guards/session-auth.guard";
import { TagRepository } from "../../repositories/tag.repository";
import { TagValidator, TagDto } from "../../validators/tag.validator";
import { TaxonomyPage } from "../../views/admin/taxonomy-page";
import { currentUser } from "../../helpers/current-user.helper";

@Controller("/admin/tags")
@UseGuards(SessionAuthGuard)
export class TagsController {
    constructor(private readonly tagRepository: TagRepository) {}

    @Get("/")
    async index(@Query("edit") editId: string | undefined, @Req() req: any) {
        const [items, editing] = await Promise.all([
            this.tagRepository.findAll(),
            editId ? this.tagRepository.findById(editId) : Promise.resolve(null),
        ]);

        return view(TaxonomyPage, {
            user: currentUser(req),
            active: "tags",
            title: "Tags",
            basePath: "/admin/tags",
            items,
            editing: editing ?? undefined,
        });
    }

    @Post("/")
    @ValidateBody(TagValidator)
    async create(@Body() dto: TagDto, @Res() res: any) {
        await this.tagRepository.create(dto);
        return res.redirect(302, "/admin/tags");
    }

    @Post("/:id")
    @ValidateBody(TagValidator)
    async update(@Param("id") id: string, @Body() dto: TagDto, @Res() res: any) {
        await this.tagRepository.update(id, dto);
        return res.redirect(302, "/admin/tags");
    }

    @Post("/:id/delete")
    async delete(@Param("id") id: string, @Res() res: any) {
        await this.tagRepository.delete(id);
        return res.redirect(302, "/admin/tags");
    }
}

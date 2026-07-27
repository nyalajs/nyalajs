import { Controller, Get, Post, Param, Body, Req, Res, UseGuards } from "@nyalajs/core";
import { ValidateBody } from "@nyalajs/validation";
import { view } from "@nyalajs/react";
import { SessionAuthGuard } from "../../guards/session-auth.guard";
import { PageRepository } from "../../repositories/page.repository";
import { PageValidator, PageDto } from "../../validators/page.validator";
import { PagesListPage } from "../../views/admin/pages-list-page";
import { PageFormPage } from "../../views/admin/page-form-page";
import { currentUser } from "../../helpers/current-user.helper";

@Controller("/admin/pages")
@UseGuards(SessionAuthGuard)
export class PagesController {
    constructor(private readonly pageRepository: PageRepository) {}

    @Get("/")
    async index(@Req() req: any) {
        const pages = await this.pageRepository.findAll();
        return view(PagesListPage, { user: currentUser(req), pages });
    }

    @Get("/new")
    newForm(@Req() req: any) {
        return view(PageFormPage, { user: currentUser(req) });
    }

    @Get("/:id/edit")
    async editForm(@Param("id") id: string, @Req() req: any) {
        const page = await this.pageRepository.findById(id);
        if (!page) return view(PagesListPage, { user: currentUser(req), pages: await this.pageRepository.findAll() });
        return view(PageFormPage, { user: currentUser(req), page });
    }

    @Post("/")
    @ValidateBody(PageValidator)
    async create(@Body() dto: PageDto, @Req() req: any, @Res() res: any) {
        const userId = req.session.get("userId");

        await this.pageRepository.create({
            title: dto.title,
            slug: dto.slug,
            status: dto.status,
            blocks: JSON.parse(dto.blocksJson),
            metaTitle: dto.metaTitle || undefined,
            metaDescription: dto.metaDescription || undefined,
            ogImage: dto.ogImage || undefined,
            authorId: userId,
            publishedAt: dto.status === "published" ? new Date() : undefined,
        } as any);

        return res.redirect(302, "/admin/pages");
    }

    @Post("/:id")
    @ValidateBody(PageValidator)
    async update(@Param("id") id: string, @Body() dto: PageDto, @Res() res: any) {
        const existing = await this.pageRepository.findById(id);

        await this.pageRepository.update(id, {
            title: dto.title,
            slug: dto.slug,
            status: dto.status,
            blocks: JSON.parse(dto.blocksJson),
            metaTitle: dto.metaTitle || undefined,
            metaDescription: dto.metaDescription || undefined,
            ogImage: dto.ogImage || undefined,
            publishedAt: existing?.publishedAt ?? (dto.status === "published" ? new Date() : undefined),
        } as any);

        return res.redirect(302, "/admin/pages");
    }

    @Post("/:id/delete")
    async delete(@Param("id") id: string, @Res() res: any) {
        await this.pageRepository.delete(id);
        return res.redirect(302, "/admin/pages");
    }
}

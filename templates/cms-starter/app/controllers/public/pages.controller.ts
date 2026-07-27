import { Controller, Get, Param } from "@nyalajs/core";
import { view } from "@nyalajs/react";
import { PageRepository } from "../../repositories/page.repository";
import { LayoutDataService } from "../../services/layout-data.service";
import { PageView } from "../../views/public/page-view";
import { NotFoundPage } from "../../views/public/not-found-page";

@Controller("/")
export class PublicPagesController {
    constructor(
        private readonly pageRepository: PageRepository,
        private readonly layoutDataService: LayoutDataService
    ) {}

    @Get("/")
    async home() {
        return this.renderPageBySlug("home");
    }

    @Get("/:slug")
    async show(@Param("slug") slug: string) {
        return this.renderPageBySlug(slug);
    }

    private async renderPageBySlug(slug: string) {
        const chrome = await this.layoutDataService.getSiteChrome();
        const page = await this.pageRepository.findPublishedBySlug(slug);

        if (!page) {
            return view(NotFoundPage, { chrome }, { statusCode: 404 });
        }

        return view(
            PageView,
            { chrome, page },
            { title: page.metaTitle ?? page.title, meta: page.metaDescription ? { description: page.metaDescription } : undefined }
        );
    }
}

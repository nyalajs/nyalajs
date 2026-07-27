import { Controller, Get, Param, Query } from "@nyalajs/core";
import { view } from "@nyalajs/react";
import { PostRepository } from "../../repositories/post.repository";
import { LayoutDataService } from "../../services/layout-data.service";
import { BlogIndexPage } from "../../views/public/blog-index-page";
import { BlogPostPage } from "../../views/public/blog-post-page";
import { NotFoundPage } from "../../views/public/not-found-page";

const PAGE_SIZE = 10;

@Controller("/blog")
export class BlogController {
    constructor(
        private readonly postRepository: PostRepository,
        private readonly layoutDataService: LayoutDataService
    ) {}

    @Get("/")
    async index(@Query("page") pageParam: string | undefined) {
        const chrome = await this.layoutDataService.getSiteChrome();
        const page = Math.max(1, Number(pageParam) || 1);

        const { posts, total } = await this.postRepository.listPublished({ page, limit: PAGE_SIZE });

        return view(BlogIndexPage, {
            chrome,
            posts,
            page,
            totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
        });
    }

    @Get("/:slug")
    async show(@Param("slug") slug: string) {
        const chrome = await this.layoutDataService.getSiteChrome();
        const post = await this.postRepository.findPublishedBySlug(slug);

        if (!post) {
            return view(NotFoundPage, { chrome }, { statusCode: 404 });
        }

        const related = post.categoryId
            ? await this.postRepository.findByCategory(post.categoryId, 3, post.id)
            : [];

        return view(
            BlogPostPage,
            { chrome, post, related },
            {
                title: post.metaTitle ?? post.title,
                meta: post.metaDescription ? { description: post.metaDescription } : undefined,
            }
        );
    }
}

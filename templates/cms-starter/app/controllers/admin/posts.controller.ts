import { Controller, Get, Post as HttpPost, Param, Body, Req, Res, UseGuards } from "@nyalajs/core";
import { ValidateBody } from "@nyalajs/validation";
import { view } from "@nyalajs/react";
import { SessionAuthGuard } from "../../guards/session-auth.guard";
import { PostRepository } from "../../repositories/post.repository";
import { CategoryRepository } from "../../repositories/category.repository";
import { PostValidator, PostDto } from "../../validators/post.validator";
import { PostsListPage } from "../../views/admin/posts-list-page";
import { PostFormPage } from "../../views/admin/post-form-page";
import { currentUser } from "../../helpers/current-user.helper";

@Controller("/admin/posts")
@UseGuards(SessionAuthGuard)
export class PostsController {
    constructor(
        private readonly postRepository: PostRepository,
        private readonly categoryRepository: CategoryRepository
    ) {}

    @Get("/")
    async index(@Req() req: any) {
        const posts = await this.postRepository.findAll();
        return view(PostsListPage, { user: currentUser(req), posts });
    }

    @Get("/new")
    async newForm(@Req() req: any) {
        const categories = await this.categoryRepository.findAll();
        return view(PostFormPage, { user: currentUser(req), categories });
    }

    @Get("/:id/edit")
    async editForm(@Param("id") id: string, @Req() req: any) {
        const [post, categories] = await Promise.all([
            this.postRepository.findById(id),
            this.categoryRepository.findAll(),
        ]);
        if (!post) return view(PostsListPage, { user: currentUser(req), posts: await this.postRepository.findAll() });
        return view(PostFormPage, { user: currentUser(req), post, categories });
    }

    @HttpPost("/")
    @ValidateBody(PostValidator)
    async create(@Body() dto: PostDto, @Req() req: any, @Res() res: any) {
        const userId = req.session.get("userId");

        await this.postRepository.create({
            title: dto.title,
            slug: dto.slug,
            excerpt: dto.excerpt || undefined,
            content: dto.content,
            coverImageUrl: dto.coverImageUrl || undefined,
            categoryId: dto.categoryId || undefined,
            status: dto.status,
            metaTitle: dto.metaTitle || undefined,
            metaDescription: dto.metaDescription || undefined,
            authorId: userId,
            publishedAt: dto.status === "published" ? new Date() : undefined,
        } as any);

        return res.redirect(302, "/admin/posts");
    }

    @HttpPost("/:id")
    @ValidateBody(PostValidator)
    async update(@Param("id") id: string, @Body() dto: PostDto, @Res() res: any) {
        const existing = await this.postRepository.findById(id);

        await this.postRepository.update(id, {
            title: dto.title,
            slug: dto.slug,
            excerpt: dto.excerpt || undefined,
            content: dto.content,
            coverImageUrl: dto.coverImageUrl || undefined,
            categoryId: dto.categoryId || undefined,
            status: dto.status,
            metaTitle: dto.metaTitle || undefined,
            metaDescription: dto.metaDescription || undefined,
            publishedAt: existing?.publishedAt ?? (dto.status === "published" ? new Date() : undefined),
        } as any);

        return res.redirect(302, "/admin/posts");
    }

    @HttpPost("/:id/delete")
    async delete(@Param("id") id: string, @Res() res: any) {
        await this.postRepository.delete(id);
        return res.redirect(302, "/admin/posts");
    }
}

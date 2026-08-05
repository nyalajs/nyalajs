import { Controller, Get, Post as HttpPost, Put, Delete, Param, Body, Req, Res, UseGuards } from "@nyalajs/core";
import { inertia, flash, flashValidationErrors, zodErrorsToInertia } from "@nyalajs/inertia";
import { SessionAuthGuard } from "../guards/session-auth.guard";
import { PostsService } from "../services/posts.service";
import { PostValidator } from "../validators/post.validator";

/**
 * The starter's one full CRUD resource. Demonstrates, for real:
 *   - shared props (current user, via InertiaShareMiddleware — see
 *     bootstrap/main.ts — not repeated in every inertia() call here)
 *   - flash messages after create/update/delete (flash(), read by the
 *     client via usePage().props.flash on the very next page)
 *   - validation errors round-tripping via Inertia's errors prop
 *     (flashValidationErrors() + a 303 redirect back to the form)
 *   - lazy props: `posts: () => this.postsService.findAll()` on index()
 *     means a partial reload of some OTHER prop on this page never
 *     re-queries every post unless the client actually asked for `posts`.
 */
@Controller("/posts")
@UseGuards(SessionAuthGuard)
export class PostsController {
    constructor(private readonly postsService: PostsService) {}

    @Get("/")
    index(@Req() req: any, @Res() res: any) {
        return inertia(req, res, "Posts/Index", {
            posts: () => this.postsService.findAll(),
        });
    }

    @Get("/create")
    createPage(@Req() req: any, @Res() res: any) {
        return inertia(req, res, "Posts/Create");
    }

    @HttpPost("/")
    async create(@Body() dto: { title: string; body: string; published?: boolean }, @Req() req: any, @Res() res: any) {
        const parsed = PostValidator.safeParse(dto);
        if (!parsed.success) {
            flashValidationErrors(req, zodErrorsToInertia(parsed.error));
            return res.redirect(303, "/posts/create");
        }

        const userId = req.session.get("userId");
        await this.postsService.create(userId, parsed.data);
        flash(req, "success", "Post created.");
        return res.redirect(303, "/posts");
    }

    @Get("/:id/edit")
    async editPage(@Param("id") id: string, @Req() req: any, @Res() res: any) {
        const post = await this.postsService.findOne(id);
        if (!post) {
            flash(req, "error", "Post not found.");
            return res.redirect(303, "/posts");
        }
        return inertia(req, res, "Posts/Edit", { post });
    }

    @Put("/:id")
    async update(
        @Param("id") id: string,
        @Body() dto: { title: string; body: string; published?: boolean },
        @Req() req: any,
        @Res() res: any
    ) {
        const parsed = PostValidator.safeParse(dto);
        if (!parsed.success) {
            flashValidationErrors(req, zodErrorsToInertia(parsed.error));
            return res.redirect(303, `/posts/${id}/edit`);
        }

        const updated = await this.postsService.update(id, parsed.data);
        if (!updated) {
            flash(req, "error", "Post not found.");
            return res.redirect(303, "/posts");
        }

        flash(req, "success", "Post updated.");
        return res.redirect(303, "/posts");
    }

    @Delete("/:id")
    async destroy(@Param("id") id: string, @Req() req: any, @Res() res: any) {
        const deleted = await this.postsService.delete(id);
        flash(req, deleted ? "success" : "error", deleted ? "Post deleted." : "Post not found.");
        return res.redirect(303, "/posts");
    }
}

import { Controller, Get, Req, Res, UseGuards } from "@nyalajs/core";
import { inertia } from "@nyalajs/inertia";
import { SessionAuthGuard } from "../guards/session-auth.guard";
import { PostsService } from "../services/posts.service";

/**
 * The dashboard landing page — real aggregate stats computed from
 * PostsService.findAll() (same data source as PostsController.index()),
 * not hardcoded placeholder numbers.
 */
@Controller("/dashboard")
@UseGuards(SessionAuthGuard)
export class DashboardController {
    constructor(private readonly postsService: PostsService) {}

    @Get("/")
    async index(@Req() req: any, @Res() res: any) {
        const posts = await this.postsService.findAll();
        const published = posts.filter((post) => post.published).length;

        return inertia(req, res, "Dashboard/Index", {
            stats: {
                total: posts.length,
                published,
                drafts: posts.length - published,
            },
            recentPosts: posts.slice(0, 5),
        });
    }
}

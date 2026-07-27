import { Controller, Get, Req, UseGuards } from "@nyalajs/core";
import { view } from "@nyalajs/react";
import { eq } from "drizzle-orm";
import { SessionAuthGuard } from "../../guards/session-auth.guard";
import { PageRepository } from "../../repositories/page.repository";
import { PostRepository } from "../../repositories/post.repository";
import { MediaRepository } from "../../repositories/media.repository";
import { FormSubmissionRepository } from "../../repositories/form-submission.repository";
import { pages } from "../../models/page.model";
import { posts } from "../../models/post.model";
import { DashboardPage } from "../../views/admin/dashboard-page";
import { currentUser } from "../../helpers/current-user.helper";

@Controller("/admin")
@UseGuards(SessionAuthGuard)
export class DashboardController {
    constructor(
        private readonly pageRepository: PageRepository,
        private readonly postRepository: PostRepository,
        private readonly mediaRepository: MediaRepository,
        private readonly formSubmissionRepository: FormSubmissionRepository
    ) {}

    @Get("/")
    async index(@Req() req: any) {
        const [publishedPages, publishedPosts, unreadSubmissions, mediaCount] = await Promise.all([
            this.pageRepository.count(eq(pages.status, "published")),
            this.postRepository.count(eq(posts.status, "published")),
            this.formSubmissionRepository.unreadCount(),
            this.mediaRepository.count(),
        ]);

        return view(DashboardPage, {
            user: currentUser(req),
            stats: { publishedPages, publishedPosts, unreadSubmissions, mediaCount },
        });
    }
}

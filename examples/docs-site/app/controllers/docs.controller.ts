import { Controller, Get, Param, Query, Req, Res } from "@nyalajs/core";
import { inertia } from "@nyalajs/inertia";
import { DocsService } from "../services/docs.service";

/**
 * Serves the real website/docs/*.md content through Inertia — every route
 * here reads the actual file on disk at request time via DocsService, no
 * static build step. The nav is real data (app/docs/nav.ts), not a
 * hand-written list per page.
 */
@Controller("/")
export class DocsController {
    constructor(private readonly docsService: DocsService) {}

    @Get("/")
    async home(@Req() req: any, @Res() res: any) {
        return inertia(req, res, "Home", {
            nav: this.docsService.getNav(),
        });
    }

    @Get("docs/*")
    async show(@Param("*") slug: string, @Req() req: any, @Res() res: any) {
        if (!(await this.docsService.exists(slug))) {
            // res.status(404) has no effect here — the actual status Fastify
            // sends comes from the returned InertiaResponse's own
            // .statusCode property (see packages/inertia/src/inertia-response.ts),
            // read by FastifyAdapter off the RenderableResponse it gets back,
            // not from whatever was called on the raw reply beforehand.
            const response = inertia(req, res, "NotFound", { slug, nav: this.docsService.getNav() });
            response.statusCode = 404;
            return response;
        }

        const page = await this.docsService.render(slug);
        const adjacent = this.docsService.getAdjacent(slug);

        return inertia(req, res, "Docs/Show", {
            slug,
            page,
            adjacent,
            nav: this.docsService.getNav(),
        });
    }

    @Get("api/search")
    async search(@Query("q") query: string | undefined, @Res() res: any) {
        const index = await this.docsService.getSearchIndex();
        const q = (query ?? "").trim().toLowerCase();

        if (!q) {
            return res.send({ results: [] });
        }

        const results = index
            .filter(
                (entry) =>
                    entry.title.toLowerCase().includes(q) ||
                    entry.excerpt.toLowerCase().includes(q) ||
                    entry.group.toLowerCase().includes(q)
            )
            .slice(0, 20);

        return res.send({ results });
    }
}

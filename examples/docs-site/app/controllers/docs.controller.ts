import { Controller, Get, Post, Put, Delete, Param, Body, Query, Req, Res } from "@nyalajs/core";
import { inertia, flash, flashValidationErrors, zodErrorsToInertia } from "@nyalajs/inertia";
import { DocsService } from "../services/docs.service";
import { DocRepository } from "../repositories/doc.repository";
import { DocValidator } from "../validators/doc.validator";

/**
 * Full CRUD over real doc content stored in the database (see
 * app/models/doc.model.ts) — reads render through DocsService's real
 * marked+shiki pipeline; writes go straight through DocRepository.
 * Same hand-run .safeParse() + flash + 303-redirect pattern as
 * inertia-starter's PostsController (see that file's own doc comment for
 * why @ValidateBody isn't used here — the real Inertia validation-error
 * round trip needs the controller to catch a validation failure and flash
 * it, not have it thrown straight to a JSON 422).
 *
 * Route shape note: slugs are multi-segment (e.g.
 * "building-blocks/controllers"), so they can only be matched with a
 * trailing wildcard (@Get("docs/*") + @Param("*")) — Fastify's router
 * (find-my-way) has no way to express "match everything, but only if
 * followed by a fixed literal segment," so a route like
 * "docs/:slug/edit" silently only ever matches single-segment slugs
 * (verified live: /docs/introduction/edit worked,
 * /docs/building-blocks/controllers/edit 404'd). The edit form is
 * therefore under a different prefix entirely — GET /edit/* — so its own
 * wildcard has nothing after it to conflict with. PUT/DELETE don't have
 * this problem since there's no literal segment after the slug on those
 * routes; they use docs/* like GET docs/* does.
 */
@Controller("/")
export class DocsController {
    constructor(
        private readonly docsService: DocsService,
        private readonly docRepository: DocRepository
    ) {}

    @Get("/")
    async home(@Req() req: any, @Res() res: any) {
        return inertia(req, res, "Home", {
            nav: await this.docsService.getNav(),
        });
    }

    @Get("docs/create")
    async createPage(@Req() req: any, @Res() res: any) {
        return inertia(req, res, "Docs/Create", {
            nav: await this.docsService.getNav(),
        });
    }

    @Post("docs")
    async create(
        @Body() dto: { slug: string; title: string; groupTitle: string; sortOrder: string; content: string },
        @Req() req: any,
        @Res() res: any
    ) {
        const parsed = DocValidator.safeParse(dto);
        if (!parsed.success) {
            flashValidationErrors(req, zodErrorsToInertia(parsed.error));
            return res.redirect(303, "/docs/create");
        }

        if (await this.docRepository.slugExists(parsed.data.slug)) {
            flashValidationErrors(req, { slug: "A doc with this slug already exists" });
            return res.redirect(303, "/docs/create");
        }

        const doc = await this.docRepository.createDoc(parsed.data);
        flash(req, "success", "Doc created.");
        return res.redirect(303, `/docs/${doc.slug}`);
    }

    @Get("edit/*")
    async editPage(@Param("*") slug: string, @Req() req: any, @Res() res: any) {
        const doc = await this.docsService.findBySlug(slug);
        if (!doc) {
            const response = inertia(req, res, "NotFound", { slug, nav: await this.docsService.getNav() });
            response.statusCode = 404;
            return response;
        }

        return inertia(req, res, "Docs/Edit", {
            doc,
            nav: await this.docsService.getNav(),
        });
    }

    @Put("docs/*")
    async update(
        @Param("*") slug: string,
        @Body() dto: { slug: string; title: string; groupTitle: string; sortOrder: string; content: string },
        @Req() req: any,
        @Res() res: any
    ) {
        const existing = await this.docsService.findBySlug(slug);
        if (!existing) {
            flash(req, "error", "Doc not found.");
            return res.redirect(303, "/");
        }

        const parsed = DocValidator.safeParse(dto);
        if (!parsed.success) {
            flashValidationErrors(req, zodErrorsToInertia(parsed.error));
            return res.redirect(303, `/edit/${slug}`);
        }

        if (parsed.data.slug !== slug && (await this.docRepository.slugExists(parsed.data.slug, existing.id))) {
            flashValidationErrors(req, { slug: "A doc with this slug already exists" });
            return res.redirect(303, `/edit/${slug}`);
        }

        const updated = await this.docRepository.update(existing.id, parsed.data);
        flash(req, "success", "Doc updated.");
        return res.redirect(303, `/docs/${updated!.slug}`);
    }

    @Delete("docs/*")
    async destroy(@Param("*") slug: string, @Req() req: any, @Res() res: any) {
        const doc = await this.docsService.findBySlug(slug);
        if (!doc) {
            flash(req, "error", "Doc not found.");
            return res.redirect(303, "/");
        }

        await this.docRepository.delete(doc.id);
        flash(req, "success", "Doc deleted.");
        return res.redirect(303, "/");
    }

    @Get("docs/*")
    async show(@Param("*") slug: string, @Req() req: any, @Res() res: any) {
        const rendered = await this.docsService.render(slug);
        if (!rendered) {
            const response = inertia(req, res, "NotFound", { slug, nav: await this.docsService.getNav() });
            response.statusCode = 404;
            return response;
        }

        const adjacent = await this.docsService.getAdjacent(slug);

        return inertia(req, res, "Docs/Show", {
            slug,
            page: { title: rendered.title, html: rendered.html, headings: rendered.headings },
            doc: rendered.doc,
            adjacent,
            nav: await this.docsService.getNav(),
        });
    }

    @Get("api/search")
    async search(@Query("q") query: string | undefined, @Res() res: any) {
        const results = await this.docsService.search(query ?? "");
        return res.send({ results });
    }
}

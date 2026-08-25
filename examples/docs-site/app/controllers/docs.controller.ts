import { Controller, Get, Post, Put, Delete, Param, Body, Query, Req, Res, UseGuards } from "@nyalajs/core";
import { ConfigService } from "@nyalajs/config";
import { inertia, flash, flashValidationErrors, zodErrorsToInertia } from "@nyalajs/inertia";
import { DocsService } from "../services/docs.service";
import { DocRepository } from "../repositories/doc.repository";
import { DocValidator } from "../validators/doc.validator";
import { AdminGuard } from "../guards/admin.guard";

const GITHUB_STARS_CACHE_MS = 10 * 60 * 1000;
let githubStarsCache: { stars: number; fetchedAt: number } | null = null;

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
        private readonly docRepository: DocRepository,
        private readonly config: ConfigService
    ) {}

    @Get("/")
    async home(@Req() req: any, @Res() res: any) {
        return inertia(req, res, "Home", {
            nav: await this.docsService.getNav(),
        });
    }

    @Get("docs/create")
    async createPage(@Req() req: any, @Res() res: any) {
        // Checked by hand rather than @UseGuards(AdminGuard) — a guard
        // failure is a plain JSON 403 (FastifyAdapter's own behavior, see
        // AdminGuard's doc comment), which would be a broken, non-Inertia
        // response on this GET page route. A real 303 redirect to the
        // login page is the correct "you can't do that yet" experience
        // for a hard navigation.
        if (req.session?.get("isAdmin") !== true) {
            return res.redirect(303, "/admin/login");
        }

        return inertia(req, res, "Docs/Create", {
            nav: await this.docsService.getNav(),
        });
    }

    @Post("docs")
    @UseGuards(AdminGuard)
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
        // Same "check by hand, redirect to login" reasoning as createPage()
        // above — see its comment.
        if (req.session?.get("isAdmin") !== true) {
            return res.redirect(303, "/admin/login");
        }

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
    @UseGuards(AdminGuard)
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
    @UseGuards(AdminGuard)
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
            page: {
                title: rendered.title,
                html: rendered.html,
                headings: rendered.headings,
                excerpt: rendered.excerpt,
            },
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

    /**
     * Proxies github.com/nyalajs/nyalajs's real star count for the
     * header's GitHub link (resources/js/hooks/use-github-stars.ts) —
     * not fetched directly from the browser because the production CSP
     * (packages/http/src/runtime/fastify-adapter.ts's helmet
     * registration, `helmet: !isDev` in bootstrap/main.ts) has no
     * connect-src override, so a browser-side fetch() to api.github.com
     * is silently blocked by the default `defaultSrc: ["'self'"]` in
     * production (confirmed against that file — it's shared framework
     * code with no CSP customization hook, not something to work around
     * per-app). A 10-minute in-memory cache keeps this well under
     * GitHub's unauthenticated 60 req/hr-per-IP limit regardless of how
     * many visitors load the page.
     */
    @Get("api/github-stars")
    async githubStars(@Res() res: any) {
        const now = Date.now();
        if (githubStarsCache && now - githubStarsCache.fetchedAt < GITHUB_STARS_CACHE_MS) {
            return res.send({ stars: githubStarsCache.stars });
        }

        try {
            const response = await fetch("https://api.github.com/repos/nyalajs/nyalajs");
            if (!response.ok) return res.send({ stars: githubStarsCache?.stars ?? null });

            const data = (await response.json()) as { stargazers_count?: number };
            const stars = typeof data.stargazers_count === "number" ? data.stargazers_count : null;
            if (stars !== null) githubStarsCache = { stars, fetchedAt: now };
            return res.send({ stars });
        } catch {
            return res.send({ stars: githubStarsCache?.stars ?? null });
        }
    }

    /** Real sitemap, generated from whatever docs actually exist right now — not a static file. */
    @Get("sitemap.xml")
    async sitemap(@Res() res: any) {
        const rows = await this.docRepository.findAllOrdered();
        const baseUrl = this.config.get<string>("app.url", "http://localhost:3000").replace(/\/$/, "");

        const urls = [
            `<url><loc>${baseUrl}/</loc><changefreq>weekly</changefreq></url>`,
            ...rows.map(
                (row) =>
                    `<url><loc>${baseUrl}/docs/${row.slug}</loc><lastmod>${row.updatedAt.toISOString()}</lastmod><changefreq>weekly</changefreq></url>`
            ),
        ].join("\n    ");

        const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
    ${urls}
</urlset>`;

        res.header("Content-Type", "application/xml");
        return res.send(xml);
    }

    /**
     * FastifyAdapter's @fastify/static registration (staticDir/staticPrefix
     * in bootstrap/main.ts) only serves one root, already used for
     * public/build/'s hashed Vite assets under /build/ — there's no second
     * slot for a plain top-level static file, so robots.txt/favicon.svg
     * are served as real routes instead, same shape as sitemap() above.
     */
    @Get("robots.txt")
    robots(@Res() res: any) {
        const baseUrl = this.config.get<string>("app.url", "http://localhost:3000").replace(/\/$/, "");
        res.header("Content-Type", "text/plain");
        return res.send(`User-agent: *\nAllow: /\n\nSitemap: ${baseUrl}/sitemap.xml\n`);
    }

    @Get("favicon.svg")
    favicon(@Res() res: any) {
        res.header("Content-Type", "image/svg+xml");
        res.header("Cache-Control", "public, max-age=86400");
        return res.send(
            `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3l1.9 5.8L20 11l-6.1 2.2L12 19l-1.9-5.8L4 11l6.1-2.2L12 3z" fill="#0f172a" stroke="#0f172a"/></svg>`
        );
    }
}

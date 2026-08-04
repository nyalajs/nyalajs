import { Controller, Get } from "@nyalajs/core";
import { RenderableResponse } from "@nyalajs/http";
import { PageRepository } from "../../repositories/page.repository";
import { PostRepository } from "../../repositories/post.repository";
import { SettingRepository } from "../../repositories/setting.repository";

/**
 * sitemap.xml / robots.txt / blog/rss.xml — plain XML/text, not HTML, so
 * these return a bare RenderableResponse-shaped object instead of
 * @nyalajs/react's view(). FastifyAdapter only cares about the shape
 * (a .render() method), not what produced it.
 */
class XmlResponse implements RenderableResponse {
    readonly contentType: string;
    constructor(private readonly xml: string, contentType = "application/xml") {
        this.contentType = contentType;
    }
    render(): string {
        return this.xml;
    }
}

@Controller("/")
export class SeoController {
    constructor(
        private readonly pageRepository: PageRepository,
        private readonly postRepository: PostRepository,
        private readonly settingRepository: SettingRepository
    ) {}

    @Get("/sitemap.xml")
    async sitemap() {
        const [pages, { posts }] = await Promise.all([
            this.pageRepository.findAll(),
            this.postRepository.listPublished({ limit: 1000 }),
        ]);

        const publishedPages = pages.filter((p) => p.status === "published");
        const urls = [
            ...publishedPages.map((p) => (p.slug === "home" ? "/" : `/${p.slug}`)),
            ...posts.map((p) => `/blog/${p.slug}`),
        ];

        const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((url) => `  <url><loc>${url}</loc></url>`).join("\n")}
</urlset>`;

        return new XmlResponse(body);
    }

    @Get("/robots.txt")
    robots() {
        return new XmlResponse("User-agent: *\nAllow: /\nSitemap: /sitemap.xml\n", "text/plain");
    }

    @Get("/blog/rss.xml")
    async rss() {
        const siteName = (await this.settingRepository.get("siteName")) ?? "Nyala CMS";
        const { posts } = await this.postRepository.listPublished({ limit: 20 });

        const items = posts
            .map(
                (p) => `  <item>
    <title>${escapeXml(p.title)}</title>
    <link>/blog/${p.slug}</link>
    <description>${escapeXml(p.excerpt ?? "")}</description>
    <pubDate>${p.publishedAt ? new Date(p.publishedAt).toUTCString() : ""}</pubDate>
  </item>`
            )
            .join("\n");

        const body = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
  <title>${escapeXml(siteName)}</title>
  <link>/blog</link>
${items}
</channel></rss>`;

        return new XmlResponse(body);
    }
}

function escapeXml(value: string): string {
    return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

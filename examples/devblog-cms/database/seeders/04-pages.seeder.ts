import { eq } from "drizzle-orm";
import { db } from "../connection";
import { pages } from "../../app/models/page.model";
import { users } from "../../app/models/user.model";

export async function run() {
    console.log("Seeding pages...");

    const [admin] = await db.select().from(users).where(eq(users.email, "admin@example.com")).limit(1);
    if (!admin) {
        console.log("  skipped: admin user not found (run the admin-user seeder first)");
        return;
    }

    await db
        .insert(pages)
        .values({
            title: "Home",
            slug: "home",
            status: "published",
            authorId: admin.id,
            publishedAt: new Date(),
            metaTitle: "Nyala Dev Blog",
            metaDescription: "A developer blog about building applications with the Nyala JS framework — DI, multi-tenancy, the ORM, the CLI, and more.",
            blocks: [
                {
                    type: "hero",
                    data: {
                        heading: "Nyala Dev Blog",
                        subheading:
                            "Notes on building real applications with Nyala JS — dependency injection, multi-tenancy, the Drizzle-based ORM, and the CLI generators.",
                    },
                },
                {
                    type: "rich-text",
                    data: {
                        html:
                            "<p>This site is a working demo: it's the <code>cms-starter</code> template running unmodified, seeded with real posts instead of placeholder text. Everything you can click — the blog, categories, tags, the admin dashboard — is the actual template's actual features.</p>",
                    },
                },
                { type: "cta", data: { text: "Read the blog", href: "/blog" } },
            ],
        })
        .onConflictDoNothing();

    await db
        .insert(pages)
        .values({
            title: "About",
            slug: "about",
            status: "published",
            authorId: admin.id,
            publishedAt: new Date(),
            metaTitle: "About — Nyala Dev Blog",
            metaDescription: "What this site is and what it's demonstrating.",
            blocks: [
                {
                    type: "hero",
                    data: { heading: "About this blog" },
                },
                {
                    type: "rich-text",
                    data: {
                        html:
                            "<p>Nyala Dev Blog is a demo application built on the <code>cms-starter</code> template that ships with the <a href=\"https://github.com/nyalajs/nyalajs\">Nyala JS</a> framework. It isn't a modified or trimmed-down version of that template — every controller, model, migration, and admin screen is exactly what <code>nyala new my-site --template=cms</code> generates. The only thing this example changes is the seed data: instead of generic placeholder posts, the database is seeded with real, technically accurate articles about the framework itself.</p><p>Browse the <a href=\"/blog\">blog</a> for posts on dependency injection, multi-tenancy, the ORM, the CLI, testing, and the module system. Log in to <code>/admin</code> with the seeded admin account to see the full CMS: post/page editing, categories and tags, the media library, menu builder, and site settings.</p><p>The goal is simple: prove the template is a real, working application, not a scaffold you have to fill in yourself.</p>",
                    },
                },
                { type: "cta", data: { text: "Visit the admin dashboard", href: "/admin" } },
            ],
        })
        .onConflictDoNothing();

    console.log("✓ Seeded 2 pages (home, about)");
}

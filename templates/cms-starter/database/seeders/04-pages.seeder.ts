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
            metaTitle: "Welcome",
            metaDescription: "Welcome to your new Nyala CMS site.",
            blocks: [
                { type: "hero", data: { heading: "Welcome to your new site", subheading: "Built with Nyala CMS." } },
                {
                    type: "rich-text",
                    data: { html: "<p>Edit this page under <code>/admin/pages</code> to change what you see here.</p>" },
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
            blocks: [{ type: "rich-text", data: { html: "<p>Tell visitors about your site here.</p>" } }],
        })
        .onConflictDoNothing();

    console.log("✓ Seeded 2 pages (home, about)");
}

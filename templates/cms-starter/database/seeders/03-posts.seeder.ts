import { eq } from "drizzle-orm";
import { db } from "../connection";
import { posts } from "../../app/models/post.model";
import { users } from "../../app/models/user.model";
import { categories } from "../../app/models/category.model";

export async function run() {
    console.log("Seeding posts...");

    const [admin] = await db.select().from(users).where(eq(users.email, "admin@example.com")).limit(1);
    const [newsCategory] = await db.select().from(categories).where(eq(categories.slug, "news")).limit(1);

    if (!admin) {
        console.log("  skipped: admin user not found (run the admin-user seeder first)");
        return;
    }

    const rows = [
        {
            title: "Welcome to your new site",
            slug: "welcome-to-your-new-site",
            excerpt: "This is your first post — edit or delete it from the admin dashboard.",
            content: "<p>This is your first post. Head to <code>/admin/posts</code> to edit or delete it.</p>",
            status: "published",
            authorId: admin.id,
            categoryId: newsCategory?.id,
            publishedAt: new Date(),
        },
        {
            title: "Getting started with the admin dashboard",
            slug: "getting-started-with-the-admin-dashboard",
            excerpt: "A quick tour of pages, posts, media, and settings.",
            content: "<p>Everything you need to run the site lives under <code>/admin</code>.</p>",
            status: "published",
            authorId: admin.id,
            categoryId: newsCategory?.id,
            publishedAt: new Date(),
        },
        {
            title: "How to customize your homepage",
            slug: "how-to-customize-your-homepage",
            excerpt: "The homepage is just a Page with slug \"home\" — edit its blocks any time.",
            content: "<p>Edit the Page with slug <code>home</code> under <code>/admin/pages</code> to change what visitors see first.</p>",
            status: "published",
            authorId: admin.id,
            categoryId: newsCategory?.id,
            publishedAt: new Date(),
        },
        {
            title: "Managing media",
            slug: "managing-media",
            excerpt: "Upload and reuse images across pages and posts.",
            content: "<p>The media library at <code>/admin/media</code> is where uploaded images live.</p>",
            status: "published",
            authorId: admin.id,
            categoryId: newsCategory?.id,
            publishedAt: new Date(),
        },
        {
            title: "A draft post",
            slug: "a-draft-post",
            excerpt: "Draft posts aren't visible on the public site until published.",
            content: "<p>This post is a draft — it won't appear on <code>/blog</code> until its status changes.</p>",
            status: "draft",
            authorId: admin.id,
            categoryId: newsCategory?.id,
        },
    ];

    for (const row of rows) {
        await db.insert(posts).values(row).onConflictDoNothing();
    }

    console.log(`✓ Seeded ${rows.length} posts`);
}

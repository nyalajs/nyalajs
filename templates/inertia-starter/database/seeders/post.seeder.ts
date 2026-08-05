import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { db } from "../connection";
import { users } from "../../app/models/user.model";
import { posts } from "../../app/models/post.model";

/** Seeds a couple of sample posts, authored by the seeded admin user. */
export async function run() {
    console.log("Seeding posts...");

    const [admin] = await db.select().from(users).where(eq(users.email, "admin@example.com")).limit(1);
    if (!admin) {
        console.log("Skipped seeding posts: run the user seeder first.");
        return;
    }

    const now = new Date();
    const samplePosts = [
        {
            id: randomUUID(),
            title: "Welcome to the Inertia starter",
            body: "This post was created by database/seeders/post.seeder.ts — edit or delete it from the Posts index page.",
            published: true,
            authorId: admin.id,
            createdAt: now,
            updatedAt: now,
        },
        {
            id: randomUUID(),
            title: "A draft post",
            body: "Unpublished posts are still visible in this simple starter — there's no separate public/admin split.",
            published: false,
            authorId: admin.id,
            createdAt: now,
            updatedAt: now,
        },
    ];

    for (const post of samplePosts) {
        await db.insert(posts).values(post).onConflictDoNothing();
    }

    console.log(`✓ Seeded ${samplePosts.length} posts`);
}

import { db } from "../connection";
import { categories } from "../../app/models/category.model";

export async function run() {
    console.log("Seeding categories...");

    const rows = [
        { name: "News", slug: "news" },
        { name: "Guides", slug: "guides" },
    ];

    for (const row of rows) {
        await db.insert(categories).values(row).onConflictDoNothing();
    }

    console.log(`✓ Seeded ${rows.length} categories`);
}

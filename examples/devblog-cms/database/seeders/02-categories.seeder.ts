import { db } from "../connection";
import { categories } from "../../app/models/category.model";

export async function run() {
    console.log("Seeding categories...");

    const rows = [
        { name: "Tutorials", slug: "tutorials" },
        { name: "Architecture", slug: "architecture" },
        { name: "Release Notes", slug: "release-notes" },
        { name: "Case Studies", slug: "case-studies" },
    ];

    for (const row of rows) {
        await db.insert(categories).values(row).onConflictDoNothing();
    }

    console.log(`✓ Seeded ${rows.length} categories`);
}

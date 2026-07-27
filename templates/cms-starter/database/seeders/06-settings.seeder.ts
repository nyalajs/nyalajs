import { db } from "../connection";
import { settings } from "../../app/models/setting.model";

export async function run() {
    console.log("Seeding settings...");

    const rows: { key: string; value: any }[] = [
        { key: "siteName", value: "Nyala CMS" },
        { key: "siteDescription", value: "Built with Nyala Framework" },
        { key: "contactEmail", value: "hello@example.com" },
        { key: "footerText", value: `© ${new Date().getFullYear()} Nyala CMS` },
        { key: "socialLinks", value: {} },
        { key: "maintenanceMode", value: false },
    ];

    for (const row of rows) {
        await db.insert(settings).values(row).onConflictDoNothing();
    }

    console.log(`✓ Seeded ${rows.length} settings`);
}

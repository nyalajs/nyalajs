import { db } from "../connection";
import { settings } from "../../app/models/setting.model";

export async function run() {
    console.log("Seeding settings...");

    const rows: { key: string; value: any }[] = [
        { key: "siteName", value: "Nyala Dev Blog" },
        { key: "siteDescription", value: "Notes on building real applications with Nyala JS — dependency injection, multi-tenancy, the ORM, and the CLI." },
        { key: "contactEmail", value: "hello@nyala-devblog.example" },
        { key: "footerText", value: `© ${new Date().getFullYear()} Nyala Dev Blog — built on the Nyala cms-starter template` },
        { key: "socialLinks", value: { github: "https://github.com/nyalajs/nyalajs" } },
        { key: "maintenanceMode", value: false },
    ];

    for (const row of rows) {
        await db.insert(settings).values(row).onConflictDoNothing();
    }

    console.log(`✓ Seeded ${rows.length} settings`);
}

import "dotenv/config";
import { closeConnection } from "./connection";

/**
 * Standalone seeder runner — `tsx database/seed.ts` (see package.json's
 * `db:seed` script). Same "nyala db:seed is Postgres-only" reasoning as
 * database/migrate.ts.
 */
async function main(): Promise<void> {
    const { run: seedDocs } = await import("./seeders/doc.seeder");
    await seedDocs();
    await closeConnection();
}

main().catch((error) => {
    console.error("Seeding failed:", error);
    process.exit(1);
});

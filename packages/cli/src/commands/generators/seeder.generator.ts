export function getSeederTemplate(className: string): string {
    return `import { Seeder } from "@nyalajs/database";
import { NodePgDatabase } from "drizzle-orm/node-postgres";

export default class ${className} extends Seeder {
    /**
     * Run the database seeds.
     */
    async run(db: NodePgDatabase): Promise<void> {
        // TODO: insert seed data
        // await db.insert(users).values({ ... });
    }
}
`;
}

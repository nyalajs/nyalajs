import { NodePgDatabase } from "drizzle-orm/node-postgres";

export abstract class Seeder {
    /**
     * Run the database seeds.
     */
    abstract run(db: NodePgDatabase): Promise<void>;
}

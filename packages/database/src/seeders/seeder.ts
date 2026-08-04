import { AnyDatabase } from "../dialect";

export abstract class Seeder {
    /**
     * Run the database seeds.
     */
    abstract run(db: AnyDatabase): Promise<void>;
}

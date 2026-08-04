import { Injectable } from "@nyalajs/core";
import { eq } from "drizzle-orm";
import { settings, Setting } from "../models/setting.model";
import { db } from "../../database/connection";

/**
 * Settings are keyed by a string primary key (not a uuid `id`), so this
 * doesn't extend BaseRepository (built around an `id` column) — it's a
 * small, self-contained key/value store instead.
 */
@Injectable()
export class SettingRepository {
    async get(key: string): Promise<any> {
        const [row] = await db.select().from(settings).where(eq(settings.key, key)).limit(1);
        return row?.value;
    }

    async all(): Promise<Setting[]> {
        return db.select().from(settings);
    }

    async set(key: string, value: any): Promise<void> {
        await db
            .insert(settings)
            .values({ key, value })
            .onConflictDoUpdate({ target: settings.key, set: { value } });
    }
}

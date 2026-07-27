import { sql } from "drizzle-orm";

export async function up(db: any) {
    await db.execute(sql`
        CREATE TABLE IF NOT EXISTS menus (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            name VARCHAR(255) NOT NULL,
            location VARCHAR(20) NOT NULL
        );
    `);
    await db.execute(sql`
        CREATE TABLE IF NOT EXISTS menu_items (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            menu_id UUID NOT NULL REFERENCES menus(id) ON DELETE CASCADE,
            label VARCHAR(255) NOT NULL,
            url VARCHAR(512),
            page_id UUID REFERENCES pages(id) ON DELETE SET NULL,
            "order" INTEGER NOT NULL DEFAULT 0,
            parent_id UUID REFERENCES menu_items(id) ON DELETE CASCADE
        );
    `);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_menu_items_menu_id ON menu_items(menu_id);`);
    console.log("✓ Migration completed: menus + menu_items tables created");
}

export async function down(db: any) {
    await db.execute(sql`DROP TABLE IF EXISTS menu_items CASCADE;`);
    await db.execute(sql`DROP TABLE IF EXISTS menus CASCADE;`);
    console.log("✓ Migration rolled back: menus + menu_items tables dropped");
}

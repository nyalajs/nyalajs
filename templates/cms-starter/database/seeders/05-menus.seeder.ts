import { eq } from "drizzle-orm";
import { db } from "../connection";
import { menus } from "../../app/models/menu.model";
import { menuItems } from "../../app/models/menu-item.model";
import { pages } from "../../app/models/page.model";

export async function run() {
    console.log("Seeding menus...");

    const [home] = await db.select().from(pages).where(eq(pages.slug, "home")).limit(1);
    const [about] = await db.select().from(pages).where(eq(pages.slug, "about")).limit(1);

    let [headerMenu] = await db.select().from(menus).where(eq(menus.location, "header")).limit(1);
    if (!headerMenu) {
        [headerMenu] = await db.insert(menus).values({ name: "Header", location: "header" }).returning();
    }

    let [footerMenu] = await db.select().from(menus).where(eq(menus.location, "footer")).limit(1);
    if (!footerMenu) {
        [footerMenu] = await db.insert(menus).values({ name: "Footer", location: "footer" }).returning();
    }

    await db
        .insert(menuItems)
        .values([
            { menuId: headerMenu.id, label: "Home", pageId: home?.id, order: 0 },
            { menuId: headerMenu.id, label: "About", pageId: about?.id, order: 1 },
            { menuId: headerMenu.id, label: "Blog", url: "/blog", order: 2 },
            { menuId: headerMenu.id, label: "Contact", url: "/contact", order: 3 },
        ])
        .onConflictDoNothing();

    await db
        .insert(menuItems)
        .values([{ menuId: footerMenu.id, label: "Contact", url: "/contact", order: 0 }])
        .onConflictDoNothing();

    console.log("✓ Seeded header + footer menus");
}

import { Injectable } from "@nyalajs/core";
import { eq, asc } from "drizzle-orm";
import { BaseRepository } from "./base.repository";
import { menus, Menu } from "../models/menu.model";
import { menuItems, MenuItem } from "../models/menu-item.model";
import { db } from "../../database/connection";

@Injectable()
export class MenuRepository extends BaseRepository<Menu> {
    constructor() {
        super(menus);
    }

    async findByLocation(location: string): Promise<Menu | null> {
        return this.findOne(eq(menus.location, location));
    }
}

@Injectable()
export class MenuItemRepository extends BaseRepository<MenuItem> {
    constructor() {
        super(menuItems);
    }

    async findByMenu(menuId: string): Promise<MenuItem[]> {
        return db.select().from(menuItems).where(eq(menuItems.menuId, menuId)).orderBy(asc(menuItems.order));
    }

    async reorder(itemIds: string[]): Promise<void> {
        await Promise.all(itemIds.map((id, index) => this.update(id, { order: index } as Partial<MenuItem>)));
    }
}

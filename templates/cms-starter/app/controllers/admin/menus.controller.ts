import { Controller, Get, Post, Param, Body, Req, Res, UseGuards } from "@nyalajs/core";
import { view } from "@nyalajs/react";
import { MenuRepository, MenuItemRepository } from "../../repositories/menu.repository";
import { PageRepository } from "../../repositories/page.repository";
import { SessionAuthGuard } from "../../guards/session-auth.guard";
import { MenusPage } from "../../views/admin/menus-page";
import { currentUser } from "../../helpers/current-user.helper";
import { Menu } from "../../models/menu.model";

@Controller("/admin/menus")
@UseGuards(SessionAuthGuard)
export class MenusController {
    constructor(
        private readonly menuRepository: MenuRepository,
        private readonly menuItemRepository: MenuItemRepository,
        private readonly pageRepository: PageRepository
    ) {}

    private async ensureMenu(location: "header" | "footer"): Promise<Menu> {
        const existing = await this.menuRepository.findByLocation(location);
        if (existing) return existing;
        return this.menuRepository.create({
            name: location === "header" ? "Header" : "Footer",
            location,
        } as any);
    }

    @Get("/")
    async index(@Req() req: any) {
        const [headerMenu, footerMenu, pages] = await Promise.all([
            this.ensureMenu("header"),
            this.ensureMenu("footer"),
            this.pageRepository.findAll(),
        ]);

        const [headerItems, footerItems] = await Promise.all([
            this.menuItemRepository.findByMenu(headerMenu.id),
            this.menuItemRepository.findByMenu(footerMenu.id),
        ]);

        return view(MenusPage, {
            user: currentUser(req),
            headerMenu,
            footerMenu,
            headerItems,
            footerItems,
            pages,
        });
    }

    @Post("/:menuId/items")
    async addItem(
        @Param("menuId") menuId: string,
        @Body() body: { label: string; pageId?: string; url?: string },
        @Res() res: any
    ) {
        const existing = await this.menuItemRepository.findByMenu(menuId);

        await this.menuItemRepository.create({
            menuId,
            label: body.label,
            pageId: body.pageId || undefined,
            url: body.pageId ? undefined : body.url || undefined,
            order: existing.length,
        } as any);

        return res.redirect(302, "/admin/menus");
    }

    @Post("/items/:id/delete")
    async deleteItem(@Param("id") id: string, @Res() res: any) {
        await this.menuItemRepository.delete(id);
        return res.redirect(302, "/admin/menus");
    }

    @Post("/:menuId/reorder")
    async reorder(@Body() body: { itemIds: string[] }, @Res() res: any) {
        await this.menuItemRepository.reorder(body.itemIds);
        return res.status(204).send();
    }
}

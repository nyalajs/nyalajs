import { Injectable } from "@nyalajs/core";
import { MenuRepository, MenuItemRepository } from "../repositories/menu.repository";
import { SettingRepository } from "../repositories/setting.repository";
import { PageRepository } from "../repositories/page.repository";

export interface NavItem {
    label: string;
    href: string;
}

export interface SiteChrome {
    siteName: string;
    footerText: string;
    headerNav: NavItem[];
    footerNav: NavItem[];
}

/**
 * Header/footer nav + site identity, shared by every public page — driven
 * by the Menu/Setting tables, not hardcoded, so admin changes take effect
 * without a redeploy.
 */
@Injectable()
export class LayoutDataService {
    constructor(
        private readonly menuRepository: MenuRepository,
        private readonly menuItemRepository: MenuItemRepository,
        private readonly settingRepository: SettingRepository,
        private readonly pageRepository: PageRepository
    ) {}

    async getSiteChrome(): Promise<SiteChrome> {
        const [headerMenu, footerMenu, siteName, footerText] = await Promise.all([
            this.menuRepository.findByLocation("header"),
            this.menuRepository.findByLocation("footer"),
            this.settingRepository.get("siteName"),
            this.settingRepository.get("footerText"),
        ]);

        const [headerNav, footerNav] = await Promise.all([
            headerMenu ? this.resolveNavItems(headerMenu.id) : Promise.resolve([]),
            footerMenu ? this.resolveNavItems(footerMenu.id) : Promise.resolve([]),
        ]);

        return {
            siteName: siteName ?? "Nyala CMS",
            footerText: footerText ?? "",
            headerNav,
            footerNav,
        };
    }

    private async resolveNavItems(menuId: string): Promise<NavItem[]> {
        const items = await this.menuItemRepository.findByMenu(menuId);
        const nav: NavItem[] = [];

        for (const item of items) {
            if (item.url) {
                nav.push({ label: item.label, href: item.url });
                continue;
            }
            if (item.pageId) {
                const page = await this.pageRepository.findById(item.pageId);
                if (page) {
                    nav.push({ label: item.label, href: page.slug === "home" ? "/" : `/${page.slug}` });
                }
            }
        }

        return nav;
    }
}

import { AdminLayout } from "../admin-layout";
import { island } from "@nyalajs/react";
import { Menu } from "../../models/menu.model";
import { MenuItem } from "../../models/menu-item.model";
import { Page } from "../../models/page.model";

export interface MenusPageProps {
    user: { name: string; role: string };
    headerMenu: Menu;
    footerMenu: Menu;
    headerItems: MenuItem[];
    footerItems: MenuItem[];
    pages: Page[];
}

function MenuSection({ menu, items, pages }: { menu: Menu; items: MenuItem[]; pages: Page[] }) {
    return (
        <div className="card" style={{ marginBottom: "1.5rem" }}>
            <h2 style={{ textTransform: "capitalize" }}>{menu.location}</h2>
            {island("MenuReorder", {
                menuId: menu.id,
                items: items.map((i) => ({ id: i.id, label: i.label })),
            })}
            <details style={{ marginTop: "1rem" }}>
                <summary>Add item</summary>
                <form method="POST" action={`/admin/menus/${menu.id}/items`} className="form-grid" style={{ marginTop: "1rem" }}>
                    <div>
                        <label htmlFor={`label-${menu.id}`}>Label</label>
                        <input id={`label-${menu.id}`} name="label" required />
                    </div>
                    <div>
                        <label htmlFor={`pageId-${menu.id}`}>Link to page</label>
                        <select id={`pageId-${menu.id}`} name="pageId">
                            <option value="">— Use custom URL instead —</option>
                            {pages.map((p) => (
                                <option key={p.id} value={p.id}>
                                    {p.title}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label htmlFor={`url-${menu.id}`}>Or custom URL</label>
                        <input id={`url-${menu.id}`} name="url" placeholder="/blog" />
                    </div>
                    <button type="submit" className="btn btn-primary">
                        Add
                    </button>
                </form>
            </details>
            <ul style={{ marginTop: "1rem" }}>
                {items.map((item) => (
                    <li key={item.id}>
                        {item.label}
                        <form method="POST" action={`/admin/menus/items/${item.id}/delete`} style={{ display: "inline", marginLeft: "0.5rem" }}>
                            <button type="submit" className="btn btn-danger">
                                Remove
                            </button>
                        </form>
                    </li>
                ))}
            </ul>
        </div>
    );
}

export function MenusPage({ user, headerMenu, footerMenu, headerItems, footerItems, pages }: MenusPageProps) {
    return (
        <AdminLayout user={user} active="menus">
            <h1>Menus</h1>
            <MenuSection menu={headerMenu} items={headerItems} pages={pages} />
            <MenuSection menu={footerMenu} items={footerItems} pages={pages} />
        </AdminLayout>
    );
}

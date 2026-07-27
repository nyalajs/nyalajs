import * as React from "react";

export interface AdminLayoutProps {
    user: { name: string; role: string };
    active?: string;
    children: React.ReactNode;
}

const NAV: { key: string; label: string; href: string }[] = [
    { key: "dashboard", label: "Dashboard", href: "/admin" },
    { key: "pages", label: "Pages", href: "/admin/pages" },
    { key: "posts", label: "Posts", href: "/admin/posts" },
    { key: "categories", label: "Categories", href: "/admin/categories" },
    { key: "tags", label: "Tags", href: "/admin/tags" },
    { key: "media", label: "Media", href: "/admin/media" },
    { key: "menus", label: "Menus", href: "/admin/menus" },
    { key: "forms", label: "Forms", href: "/admin/forms" },
    { key: "users", label: "Users", href: "/admin/users" },
    { key: "settings", label: "Settings", href: "/admin/settings" },
];

/** Admin dashboard chrome — sidebar + top bar, composed inside each admin page component. */
export function AdminLayout({ user, active, children }: AdminLayoutProps) {
    return (
        <div className="admin">
            <aside className="admin-sidebar">
                <div className="admin-brand">Nyala CMS</div>
                <nav>
                    {NAV.map((item) => (
                        <a key={item.key} href={item.href} className={item.key === active ? "active" : ""}>
                            {item.label}
                        </a>
                    ))}
                </nav>
            </aside>
            <div className="admin-body">
                <header className="admin-topbar">
                    <span>
                        {user.name} <em>({user.role})</em>
                    </span>
                    <form method="POST" action="/admin/logout">
                        <button type="submit">Log out</button>
                    </form>
                </header>
                <main className="admin-content">{children}</main>
            </div>
        </div>
    );
}

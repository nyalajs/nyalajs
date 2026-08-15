import { LayoutDashboard, FileText, Settings } from "lucide-react";

export interface NavItem {
    title: string;
    href: string;
    icon: typeof LayoutDashboard;
    /** Matches this item as active for any sub-route (e.g. /posts/5/edit), not just an exact URL match. */
    matchPrefix?: boolean;
}

export const navItems: NavItem[] = [
    { title: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    { title: "Posts", href: "/posts", icon: FileText, matchPrefix: true },
    { title: "Settings", href: "/settings", icon: Settings },
];

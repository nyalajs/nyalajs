import { Link } from "@nyalajs/inertia/client";
import { cn } from "@/lib/utils";
import { navItems } from "./nav-items";

interface SidebarNavProps {
    currentUrl: string;
    onNavigate?: () => void;
}

/** The nav link list — shared verbatim between the desktop sidebar and the mobile Sheet drawer. */
export function SidebarNav({ currentUrl, onNavigate }: SidebarNavProps) {
    return (
        <nav className="flex flex-1 flex-col gap-1 px-3 py-2">
            {navItems.map((item) => {
                const isActive = item.matchPrefix
                    ? currentUrl === item.href || currentUrl.startsWith(`${item.href}/`)
                    : currentUrl === item.href;
                const Icon = item.icon;

                return (
                    <Link
                        key={item.href}
                        href={item.href}
                        onClick={onNavigate}
                        className={cn(
                            "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                            isActive
                                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                                : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                        )}
                    >
                        <Icon className="h-4 w-4 shrink-0" />
                        {item.title}
                    </Link>
                );
            })}
        </nav>
    );
}

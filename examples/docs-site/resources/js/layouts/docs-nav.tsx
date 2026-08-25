import { Link } from "@nyalajs/inertia/client";
import { cn } from "@/lib/utils";
import type { NavGroup } from "../types/docs";

interface DocsNavProps {
    nav: NavGroup[];
    currentUrl: string;
    onNavigate?: () => void;
}

/** The grouped sidebar link list — shared between the fixed desktop sidebar and the mobile Sheet drawer. */
export function DocsNav({ nav, currentUrl, onNavigate }: DocsNavProps) {
    return (
        <nav className="flex flex-col gap-6">
            {nav.map((group) => (
                <div key={group.title}>
                    <h4 className="mb-2 px-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {group.title}
                    </h4>
                    <ul className="flex flex-col gap-0.5">
                        {group.items.map((item) => {
                            const href = `/docs/${item.slug}`;
                            const isActive = currentUrl === href;
                            return (
                                <li key={item.slug}>
                                    <Link
                                        href={href}
                                        onClick={onNavigate}
                                        className={cn(
                                            "block rounded-md px-3 py-1.5 text-sm transition-colors",
                                            isActive
                                                ? "bg-primary/10 font-medium text-primary"
                                                : "text-muted-foreground hover:bg-muted hover:text-foreground"
                                        )}
                                    >
                                        {item.title}
                                    </Link>
                                </li>
                            );
                        })}
                    </ul>
                </div>
            ))}
        </nav>
    );
}

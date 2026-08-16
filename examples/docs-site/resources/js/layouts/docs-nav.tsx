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
                    <h4 className="mb-2 text-sm font-semibold text-foreground">{group.title}</h4>
                    <ul className="flex flex-col gap-0.5 border-l">
                        {group.items.map((item) => {
                            const href = `/docs/${item.slug}`;
                            const isActive = currentUrl === href;
                            return (
                                <li key={item.slug}>
                                    <Link
                                        href={href}
                                        onClick={onNavigate}
                                        className={cn(
                                            "-ml-px block border-l pl-3 py-1 text-sm transition-colors",
                                            isActive
                                                ? "border-l-primary font-medium text-primary"
                                                : "border-l-transparent text-muted-foreground hover:border-l-foreground/30 hover:text-foreground"
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

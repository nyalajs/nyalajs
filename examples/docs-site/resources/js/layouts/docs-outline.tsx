import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import type { DocHeading } from "../types/docs";

interface DocsOutlineProps {
    headings: DocHeading[];
}

/** The right-side "On this page" sticky outline, active section tracked via IntersectionObserver. */
export function DocsOutline({ headings }: DocsOutlineProps) {
    const [activeId, setActiveId] = useState<string | null>(null);

    useEffect(() => {
        if (headings.length === 0) return;

        const observer = new IntersectionObserver(
            (entries) => {
                const visible = entries.filter((entry) => entry.isIntersecting);
                if (visible.length > 0) {
                    setActiveId(visible[0].target.id);
                }
            },
            { rootMargin: "-80px 0px -70% 0px" }
        );

        for (const heading of headings) {
            const el = document.getElementById(heading.id);
            if (el) observer.observe(el);
        }

        return () => observer.disconnect();
    }, [headings]);

    if (headings.length === 0) return null;

    return (
        <nav className="sticky top-20 hidden max-h-[calc(100vh-6rem)] w-56 shrink-0 overflow-y-auto py-6 pr-2 xl:block">
            <p className="mb-2 text-sm font-semibold text-foreground">On this page</p>
            <ul className="flex flex-col gap-1.5 border-l text-sm">
                {headings.map((heading) => (
                    <li key={heading.id} style={{ paddingLeft: `${(heading.depth - 2) * 0.75 + 0.75}rem` }}>
                        <a
                            href={`#${heading.id}`}
                            className={cn(
                                "-ml-px block border-l-2 py-0.5 pl-3 transition-colors",
                                activeId === heading.id
                                    ? "border-primary font-medium text-primary"
                                    : "border-transparent text-muted-foreground hover:text-foreground"
                            )}
                        >
                            {heading.text}
                        </a>
                    </li>
                ))}
            </ul>
        </nav>
    );
}

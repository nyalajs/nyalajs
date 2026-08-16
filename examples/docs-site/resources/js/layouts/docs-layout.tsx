import { PropsWithChildren, useEffect, useState } from "react";
import { Link, usePage } from "@nyalajs/inertia/client";
import { Menu, Search, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { DocsNav } from "./docs-nav";
import { DocsSearch } from "./docs-search";
import type { NavGroup } from "../types/docs";

interface PageProps {
    nav: NavGroup[];
    [key: string]: unknown;
}

/**
 * The Laravel-docs-style shell: sticky header (logo, search trigger),
 * fixed left sidebar of grouped nav links (collapses into a Sheet drawer
 * below lg), and a content column. Every /docs/:slug page and the home
 * page render through this.
 */
export function DocsLayout({ children }: PropsWithChildren) {
    const { props, url } = usePage<PageProps>();
    const { nav } = props;
    const [mobileNavOpen, setMobileNavOpen] = useState(false);
    const [searchOpen, setSearchOpen] = useState(false);

    useEffect(() => {
        function onKeyDown(e: KeyboardEvent) {
            if ((e.metaKey || e.ctrlKey) && e.key === "k") {
                e.preventDefault();
                setSearchOpen(true);
            }
        }
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, []);

    return (
        <div className="min-h-screen bg-background">
            <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
                <div className="flex h-14 items-center gap-4 px-4 sm:px-6">
                    <Button
                        variant="ghost"
                        size="icon"
                        className="lg:hidden"
                        onClick={() => setMobileNavOpen(true)}
                        aria-label="Open navigation"
                    >
                        <Menu className="h-5 w-5" />
                    </Button>

                    <Link href="/" className="flex items-center gap-2 font-semibold">
                        <Sparkles className="h-5 w-5 text-primary" />
                        Nyala Docs
                    </Link>

                    <div className="flex-1" />

                    <Button
                        variant="outline"
                        className="w-full max-w-xs justify-start gap-2 text-muted-foreground sm:w-64"
                        onClick={() => setSearchOpen(true)}
                    >
                        <Search className="h-4 w-4" />
                        <span className="flex-1 text-left">Search docs...</span>
                        <kbd className="hidden rounded border bg-muted px-1.5 py-0.5 text-xs sm:inline">⌘K</kbd>
                    </Button>
                </div>
            </header>

            <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
                <SheetContent side="left" className="w-72 overflow-y-auto p-0">
                    <SheetTitle className="sr-only">Navigation</SheetTitle>
                    <div className="p-4">
                        <DocsNav nav={nav} currentUrl={url} onNavigate={() => setMobileNavOpen(false)} />
                    </div>
                </SheetContent>
            </Sheet>

            <DocsSearch open={searchOpen} onOpenChange={setSearchOpen} />

            <div className="mx-auto flex max-w-[1400px]">
                <aside className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-64 shrink-0 overflow-y-auto border-r px-4 py-6 lg:block">
                    <DocsNav nav={nav} currentUrl={url} />
                </aside>

                <main className="min-w-0 flex-1">{children}</main>
            </div>
        </div>
    );
}

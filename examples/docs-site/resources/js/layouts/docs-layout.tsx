import { PropsWithChildren, useEffect, useState } from "react";
import { Link, router, usePage } from "@nyalajs/inertia/client";
import { LogOut, Menu, Plus, Search, ShieldCheck, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { ThemeToggle } from "./theme-toggle";
import { DocsNav } from "./docs-nav";
import { DocsSearch } from "./docs-search";
import { DiscordIcon, GithubIcon, NpmIcon, XIcon } from "@/components/social-icons";
import { useGithubStars } from "@/hooks/use-github-stars";
import nyalaLogoAsset from "@/assets/nyala-logo.png";
import type { NavGroup } from "../types/docs";

/**
 * In prod, Vite's `import img from "./x.png"` gives back a real
 * /build/assets/... URL the same origin serves — works as-is. In dev,
 * html-shell.ts's dev-mode <script> tags point straight at the Vite dev
 * server's own origin (docs/inertia-starter-spec.md §4), but the PAGE
 * itself is still served by this app's own Fastify backend on a
 * different port — so Vite's dev-mode asset URL comes back as a bare
 * root-relative path (e.g. "/resources/js/assets/nyala-logo.png"),
 * which the browser resolves against the PAGE's origin, not Vite's
 * (confirmed live: 404 at http://localhost:3900/resources/..., 200 at
 * http://localhost:5173/resources/...).
 *
 * __NYALA_IS_VITE_BUILD__ (vite.config.ts's `define`), not
 * import.meta.env.DEV/PROD — this app's own .env sets
 * NODE_ENV=development for the Node backend's unrelated purposes, and
 * Vite's DEV/PROD flags track *mode* (derived from NODE_ENV), not
 * *command* (build vs serve), so import.meta.env.DEV was still `true`
 * inside a genuine `vite build` output (confirmed live: a production
 * build baked in a dev-Vite-origin-prefixed URL). __NYALA_IS_VITE_BUILD__
 * is tied to the real build command instead.
 */
const nyalaLogo = __NYALA_IS_VITE_BUILD__
    ? nyalaLogoAsset
    : `${import.meta.env.VITE_DEV_SERVER_URL ?? "http://localhost:5173"}${nyalaLogoAsset}`;

interface PageProps {
    nav: NavGroup[];
    isAdmin: boolean;
    [key: string]: unknown;
}

const GITHUB_REPO_URL = "https://github.com/nyalajs/nyalajs";
const NPM_ORG_URL = "https://www.npmjs.com/org/nyalajs";

function formatStars(count: number): string {
    return count >= 1000 ? `${(count / 1000).toFixed(1).replace(/\.0$/, "")}k` : String(count);
}

/**
 * Picks one representative slug per major nav group for the header's
 * top-level nav row — computed from the real `nav` prop every page
 * already receives (DocsService.getNav(), grouped in real DB order), not
 * a hardcoded list of routes, since this app has no separate /guide or
 * /api top-level pages the way the main VitePress site does (everything
 * lives under /docs/:slug). Falls back gracefully to however many groups
 * actually exist, so an empty or partially-seeded database never crashes
 * this — it just renders fewer links.
 */
function topLevelNavLinks(nav: NavGroup[]): { title: string; href: string }[] {
    const wanted = ["Getting Started", "API Reference", "Building Blocks", "Examples"];
    return wanted
        .map((title) => nav.find((group) => group.title === title))
        .filter((group): group is NavGroup => !!group && group.items.length > 0)
        .map((group) => ({ title: group.title, href: `/docs/${group.items[0].slug}` }));
}

/**
 * The Laravel-docs-style shell: sticky header (brand mark, top-level nav,
 * search trigger, GitHub/NPM/Discord/X, theme toggle, admin controls),
 * fixed left sidebar of grouped nav links (collapses into a Sheet drawer
 * below lg), and a content column. Every /docs/:slug page and the home
 * page render through this.
 */
export function DocsLayout({ children }: PropsWithChildren) {
    const { props, url } = usePage<PageProps>();
    const { nav, isAdmin } = props;
    const [mobileNavOpen, setMobileNavOpen] = useState(false);
    const [searchOpen, setSearchOpen] = useState(false);
    const stars = useGithubStars();
    const topNav = topLevelNavLinks(nav);

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

                    <Link href="/" className="flex shrink-0 items-center" aria-label="Nyala Docs home">
                        {/* assets/logo.png's real kudu-head + wordmark lockup already
                            carries the brand name — no separate "Nyala Docs" text
                            label needed alongside it. */}
                        <img src={nyalaLogo} alt="Nyala" className="h-7 w-auto" />
                    </Link>

                    <nav className="hidden items-center gap-1 md:flex">
                        {topNav.map((item) => (
                            <Link
                                key={item.href}
                                href={item.href}
                                className="rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                            >
                                {item.title}
                            </Link>
                        ))}
                    </nav>

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

                    <div className="hidden items-center gap-0.5 sm:flex">
                        <Button asChild variant="ghost" size="icon" className="shrink-0 text-muted-foreground">
                            <a href={GITHUB_REPO_URL} target="_blank" rel="noreferrer" aria-label="GitHub repository">
                                <GithubIcon className="h-4 w-4" />
                            </a>
                        </Button>
                        {stars !== null && (
                            <a
                                href={GITHUB_REPO_URL}
                                target="_blank"
                                rel="noreferrer"
                                className="-ml-1.5 flex items-center gap-0.5 pr-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                            >
                                <Star className="h-3 w-3" />
                                {formatStars(stars)}
                            </a>
                        )}
                        <Button asChild variant="ghost" size="icon" className="shrink-0 text-muted-foreground">
                            <a href={NPM_ORG_URL} target="_blank" rel="noreferrer" aria-label="NPM packages">
                                <NpmIcon className="h-4 w-4" />
                            </a>
                        </Button>
                        <Button asChild variant="ghost" size="icon" className="shrink-0 text-muted-foreground">
                            <a href="#" title="Discord — coming soon" aria-label="Discord (coming soon)">
                                <DiscordIcon className="h-4 w-4" />
                            </a>
                        </Button>
                        <Button asChild variant="ghost" size="icon" className="shrink-0 text-muted-foreground">
                            <a href="#" title="X — coming soon" aria-label="X (coming soon)">
                                <XIcon className="h-4 w-4" />
                            </a>
                        </Button>
                    </div>

                    <ThemeToggle />

                    {isAdmin ? (
                        <>
                            <Button asChild variant="ghost" size="icon" className="shrink-0">
                                <Link href="/docs/create" aria-label="New doc">
                                    <Plus className="h-4 w-4" />
                                </Link>
                            </Button>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="shrink-0 text-muted-foreground"
                                aria-label="Log out"
                                onClick={() => router.post("/admin/logout")}
                            >
                                <LogOut className="h-4 w-4" />
                            </Button>
                        </>
                    ) : (
                        <Button asChild variant="ghost" size="icon" className="shrink-0 text-muted-foreground">
                            <Link href="/admin/login" aria-label="Admin login">
                                <ShieldCheck className="h-4 w-4" />
                            </Link>
                        </Button>
                    )}
                </div>
            </header>

            <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
                <SheetContent side="left" className="w-72 overflow-y-auto p-0">
                    <SheetTitle className="sr-only">Navigation</SheetTitle>
                    <div className="p-4">
                        <DocsNav nav={nav} currentUrl={url} onNavigate={() => setMobileNavOpen(false)} />
                    </div>
                    <div className="flex items-center gap-1 border-t p-4">
                        <Button asChild variant="ghost" size="icon" className="text-muted-foreground">
                            <a href={GITHUB_REPO_URL} target="_blank" rel="noreferrer" aria-label="GitHub repository">
                                <GithubIcon className="h-4 w-4" />
                            </a>
                        </Button>
                        <Button asChild variant="ghost" size="icon" className="text-muted-foreground">
                            <a href={NPM_ORG_URL} target="_blank" rel="noreferrer" aria-label="NPM packages">
                                <NpmIcon className="h-4 w-4" />
                            </a>
                        </Button>
                        <Button asChild variant="ghost" size="icon" className="text-muted-foreground">
                            <a href="#" title="Discord — coming soon" aria-label="Discord (coming soon)">
                                <DiscordIcon className="h-4 w-4" />
                            </a>
                        </Button>
                        <Button asChild variant="ghost" size="icon" className="text-muted-foreground">
                            <a href="#" title="X — coming soon" aria-label="X (coming soon)">
                                <XIcon className="h-4 w-4" />
                            </a>
                        </Button>
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

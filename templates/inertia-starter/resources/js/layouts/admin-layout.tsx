import { PropsWithChildren, useState } from "react";
import { Link, router, usePage } from "@nyalajs/inertia/client";
import { LogOut, Menu, Sparkles, User as UserIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarNav } from "./sidebar-nav";

interface PageProps {
    user: { id: string; name: string; email: string } | null;
    flash: { success?: string; error?: string };
    [key: string]: unknown;
}

function initials(name: string) {
    return name
        .split(" ")
        .map((part) => part[0])
        .filter(Boolean)
        .slice(0, 2)
        .join("")
        .toUpperCase();
}

/**
 * The admin dashboard chrome: a fixed sidebar on desktop (lg+), collapsing
 * into a Sheet drawer below that breakpoint, plus a sticky topbar with a
 * mobile menu trigger and the user's account dropdown. Every dashboard/CRUD
 * page (Posts, Settings, ...) renders through this — the public Welcome
 * page does not, since it has its own marketing-page chrome.
 */
export function AdminLayout({ children }: PropsWithChildren) {
    const { props, url } = usePage<PageProps>();
    const { user, flash } = props;
    const [mobileNavOpen, setMobileNavOpen] = useState(false);

    function logout() {
        router.post("/logout");
    }

    return (
        <div className="flex min-h-screen w-full bg-muted/30">
            {/* Desktop sidebar */}
            <aside className="hidden w-64 shrink-0 flex-col border-r bg-sidebar lg:flex">
                <div className="flex h-16 items-center gap-2 px-6">
                    <Sparkles className="h-5 w-5 text-sidebar-primary" />
                    <span className="font-semibold text-sidebar-foreground">Nyala Admin</span>
                </div>
                <Separator className="bg-sidebar-border" />
                <SidebarNav currentUrl={url} />
                <div className="mt-auto p-4">
                    <p className="text-xs text-sidebar-foreground/60">
                        Built with Nyala + Inertia + shadcn/ui
                    </p>
                </div>
            </aside>

            {/* Mobile sidebar (Sheet drawer) */}
            <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
                <SheetContent side="left" className="w-64 bg-sidebar p-0 text-sidebar-foreground">
                    <SheetTitle className="sr-only">Navigation</SheetTitle>
                    <div className="flex h-16 items-center gap-2 px-6">
                        <Sparkles className="h-5 w-5 text-sidebar-primary" />
                        <span className="font-semibold">Nyala Admin</span>
                    </div>
                    <Separator className="bg-sidebar-border" />
                    <SidebarNav currentUrl={url} onNavigate={() => setMobileNavOpen(false)} />
                </SheetContent>
            </Sheet>

            <div className="flex min-w-0 flex-1 flex-col">
                {/* Topbar */}
                <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b bg-background px-4 sm:px-6">
                    <Button
                        variant="ghost"
                        size="icon"
                        className="lg:hidden"
                        onClick={() => setMobileNavOpen(true)}
                        aria-label="Open navigation"
                    >
                        <Menu className="h-5 w-5" />
                    </Button>

                    <div className="flex-1" />

                    {user && (
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" className="flex items-center gap-2 px-2">
                                    <Avatar className="h-8 w-8">
                                        <AvatarFallback className="bg-primary text-xs text-primary-foreground">
                                            {initials(user.name)}
                                        </AvatarFallback>
                                    </Avatar>
                                    <span className="hidden text-sm font-medium sm:inline">{user.name}</span>
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-56">
                                <DropdownMenuLabel>
                                    <div className="flex flex-col">
                                        <span className="font-medium">{user.name}</span>
                                        <span className="text-xs font-normal text-muted-foreground">{user.email}</span>
                                    </div>
                                </DropdownMenuLabel>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem asChild>
                                    <Link href="/settings" className="flex w-full items-center gap-2">
                                        <UserIcon className="h-4 w-4" />
                                        Settings
                                    </Link>
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={logout} className="gap-2 text-destructive focus:text-destructive">
                                    <LogOut className="h-4 w-4" />
                                    Log out
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    )}
                </header>

                {/* Flash messages */}
                {(flash?.success || flash?.error) && (
                    <div className="px-4 pt-4 sm:px-6">
                        {flash.success && (
                            <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-400">
                                {flash.success}
                            </div>
                        )}
                        {flash.error && (
                            <div className="mt-2 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                                {flash.error}
                            </div>
                        )}
                    </div>
                )}

                <main className="flex-1 p-4 sm:p-6">{children}</main>
            </div>
        </div>
    );
}

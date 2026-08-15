import { PropsWithChildren } from "react";
import { Link, router, usePage } from "@nyalajs/inertia/client";

/**
 * Shared chrome for every logged-in page — reads `user` (a shared prop,
 * merged into every InertiaResponse by InertiaShareMiddleware, see
 * bootstrap/main.ts) and `flash` (set by controllers via flash(), see
 * app/controllers/posts.controller.ts) straight off usePage().props,
 * exactly like any other real Inertia app's layout.
 */
interface PageProps {
    user: { id: string; name: string; email: string } | null;
    flash: { success?: string; error?: string };
    [key: string]: unknown;
}

export function Layout({ children }: PropsWithChildren) {
    const { props } = usePage<PageProps>();
    const { user, flash } = props;

    function logout() {
        router.post("/logout");
    }

    return (
        <div style={{ fontFamily: "system-ui, sans-serif", maxWidth: 720, margin: "0 auto", padding: "2rem 1rem" }}>
            <nav style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
                <Link href="/posts" style={{ fontWeight: 600, textDecoration: "none", color: "inherit" }}>
                    Nyala Inertia Starter
                </Link>
                {user ? (
                    <span>
                        {user.name}{" "}
                        <button onClick={logout} style={{ marginLeft: "0.5rem" }}>
                            Log out
                        </button>
                    </span>
                ) : (
                    <span>
                        <Link href="/login">Log in</Link> · <Link href="/register">Register</Link>
                    </span>
                )}
            </nav>

            {flash?.success && (
                <div style={{ background: "#e6ffed", border: "1px solid #34d399", padding: "0.75rem 1rem", borderRadius: 6, marginBottom: "1rem" }}>
                    {flash.success}
                </div>
            )}
            {flash?.error && (
                <div style={{ background: "#fef2f2", border: "1px solid #f87171", padding: "0.75rem 1rem", borderRadius: 6, marginBottom: "1rem" }}>
                    {flash.error}
                </div>
            )}

            {children}
        </div>
    );
}

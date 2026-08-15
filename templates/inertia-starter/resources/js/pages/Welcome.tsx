import { Head, Link, usePage } from "@nyalajs/inertia/client";
import {
    ArrowRight,
    Boxes,
    Github,
    Layers,
    LayoutDashboard,
    Lock,
    Sparkles,
    Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface PageProps {
    user: { id: string; name: string; email: string } | null;
    [key: string]: unknown;
}

const features = [
    {
        icon: Zap,
        title: "Real Inertia protocol",
        description:
            "X-Inertia headers, partial reloads, and versioned asset reloads — a real implementation of the Inertia.js server contract, not a simulation.",
    },
    {
        icon: Lock,
        title: "Session-based auth",
        description:
            "Cookie sessions via @fastify/secure-session, guarded routes, and validation errors that round-trip through flash storage exactly like a classic server-rendered app.",
    },
    {
        icon: Layers,
        title: "Zero client data layer",
        description:
            "No REST client, no GraphQL, no TanStack Query. Controllers return page components with props; the React app just renders them.",
    },
    {
        icon: Boxes,
        title: "DI all the way down",
        description:
            "Controllers, services, and repositories are ordinary @Injectable() providers resolved by Nyala's own container — the same DI model as the rest of the framework.",
    },
];

const stack = [
    { name: "Nyala", detail: "DI, decorators, kernel" },
    { name: "Fastify", detail: "HTTP layer" },
    { name: "Inertia.js", detail: "Server ↔ client protocol" },
    { name: "React", detail: "UI" },
    { name: "Drizzle", detail: "SQLite ORM" },
    { name: "shadcn/ui", detail: "Components" },
];

export default function Welcome() {
    const { props } = usePage<PageProps>();
    const { user } = props;

    return (
        <div className="min-h-screen bg-background">
            <Head title="Welcome" />

            <header className="border-b">
                <div className="container flex h-16 items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                        <Sparkles className="h-5 w-5 shrink-0 text-primary" />
                        <span className="truncate font-semibold">
                            <span className="sm:hidden">Nyala Starter</span>
                            <span className="hidden sm:inline">Nyala Inertia Starter</span>
                        </span>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                        {user ? (
                            <Button asChild size="sm" className="sm:h-10 sm:px-4 sm:py-2 sm:text-sm">
                                <Link href="/dashboard">
                                    Dashboard
                                    <ArrowRight className="h-4 w-4" />
                                </Link>
                            </Button>
                        ) : (
                            <>
                                <Button asChild variant="ghost" size="sm" className="sm:h-10 sm:px-4 sm:py-2 sm:text-sm">
                                    <Link href="/login">Log in</Link>
                                </Button>
                                <Button asChild size="sm" className="sm:h-10 sm:px-4 sm:py-2 sm:text-sm">
                                    <Link href="/register">Get started</Link>
                                </Button>
                            </>
                        )}
                    </div>
                </div>
            </header>

            <section className="border-b bg-gradient-to-b from-muted/50 to-background">
                <div className="container flex flex-col items-center gap-6 py-20 text-center sm:py-28">
                    <Badge variant="secondary" className="gap-1.5 px-3 py-1">
                        <Sparkles className="h-3.5 w-3.5" />
                        Nyala Framework + Inertia.js
                    </Badge>
                    <h1 className="max-w-3xl text-4xl font-bold tracking-tight sm:text-6xl">
                        One codebase. <span className="text-primary">No API to maintain.</span>
                    </h1>
                    <p className="max-w-2xl text-lg text-muted-foreground">
                        A TypeScript backend and a React frontend, talking over the real Inertia.js
                        protocol — controllers return page components with props, and the client
                        renders them. No REST layer, no client-side router, no data-fetching
                        library to wire up.
                    </p>
                    <div className="flex flex-wrap items-center justify-center gap-3">
                        <Button asChild size="lg">
                            <Link href={user ? "/dashboard" : "/register"}>
                                {user ? "Go to dashboard" : "Create an account"}
                                <ArrowRight className="h-4 w-4" />
                            </Link>
                        </Button>
                        <Button asChild size="lg" variant="outline">
                            <a href="https://github.com/nyalajs/nyalajs" target="_blank" rel="noreferrer">
                                <Github className="h-4 w-4" />
                                View on GitHub
                            </a>
                        </Button>
                    </div>
                </div>
            </section>

            <section className="container py-20">
                <div className="mx-auto max-w-2xl text-center">
                    <h2 className="text-3xl font-semibold tracking-tight">Built for the real Inertia model</h2>
                    <p className="mt-3 text-muted-foreground">
                        Every piece in this starter is real, working code — not a mock. Register an
                        account and open the dashboard to see it end to end.
                    </p>
                </div>

                <div className="mx-auto mt-12 grid max-w-5xl grid-cols-1 gap-4 sm:grid-cols-2">
                    {features.map((feature) => (
                        <Card key={feature.title}>
                            <CardHeader>
                                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                                    <feature.icon className="h-5 w-5 text-primary" />
                                </div>
                                <CardTitle className="mt-3 text-base">{feature.title}</CardTitle>
                                <CardDescription>{feature.description}</CardDescription>
                            </CardHeader>
                        </Card>
                    ))}
                </div>
            </section>

            <section className="border-t bg-muted/30">
                <div className="container py-16">
                    <div className="mx-auto max-w-4xl">
                        <div className="flex items-center gap-2">
                            <LayoutDashboard className="h-5 w-5 text-primary" />
                            <h2 className="text-xl font-semibold">What's under the hood</h2>
                        </div>
                        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
                            {stack.map((item) => (
                                <div key={item.name} className="rounded-lg border bg-card p-4">
                                    <p className="font-medium">{item.name}</p>
                                    <p className="text-sm text-muted-foreground">{item.detail}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </section>

            <footer className="border-t">
                <div className="container flex flex-col items-center justify-between gap-4 py-8 text-sm text-muted-foreground sm:flex-row">
                    <span>Nyala Inertia Starter — MIT licensed.</span>
                    <div className="flex gap-4">
                        <Link href="/login" className="hover:text-foreground">
                            Log in
                        </Link>
                        <Link href="/register" className="hover:text-foreground">
                            Register
                        </Link>
                    </div>
                </div>
            </footer>
        </div>
    );
}

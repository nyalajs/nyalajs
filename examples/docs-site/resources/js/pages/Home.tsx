import { Head, Link } from "@nyalajs/inertia/client";
import { ArrowRight, BookOpen, Rocket } from "lucide-react";
import { DocsLayout } from "@/layouts/docs-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { NavGroup } from "../types/docs";

interface Props {
    nav: NavGroup[];
    [key: string]: unknown;
}

export default function Home({ nav }: Props) {
    return (
        <DocsLayout>
            <Head title="Nyala Documentation" />

            <div className="px-4 py-16 sm:px-6 lg:px-8">
                <div className="mx-auto max-w-3xl text-center">
                    <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">Nyala Documentation</h1>
                    <p className="mt-4 text-lg text-muted-foreground">
                        Real docs, rendered live from the actual website/docs/*.md source by this
                        Inertia + Nyala app — not a static build.
                    </p>
                    <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                        <Button asChild size="lg">
                            <Link href="/docs/introduction">
                                Get Started
                                <ArrowRight className="h-4 w-4" />
                            </Link>
                        </Button>
                        <Button asChild size="lg" variant="outline">
                            <Link href="/docs/cli/templates">Browse Templates</Link>
                        </Button>
                    </div>
                </div>

                <div className="mx-auto mt-16 grid max-w-5xl grid-cols-1 gap-4 sm:grid-cols-2">
                    {nav.map((group) => (
                        <Card key={group.title}>
                            <CardHeader>
                                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                                    {group.title === "Getting Started" ? (
                                        <Rocket className="h-4 w-4 text-primary" />
                                    ) : (
                                        <BookOpen className="h-4 w-4 text-primary" />
                                    )}
                                </div>
                                <CardTitle className="mt-2 text-base">{group.title}</CardTitle>
                                <CardDescription>
                                    <ul className="mt-1 flex flex-col gap-1">
                                        {group.items.slice(0, 4).map((item) => (
                                            <li key={item.slug}>
                                                <Link
                                                    href={`/docs/${item.slug}`}
                                                    className="text-foreground/80 hover:text-primary hover:underline"
                                                >
                                                    {item.title}
                                                </Link>
                                            </li>
                                        ))}
                                    </ul>
                                </CardDescription>
                            </CardHeader>
                        </Card>
                    ))}
                </div>
            </div>
        </DocsLayout>
    );
}

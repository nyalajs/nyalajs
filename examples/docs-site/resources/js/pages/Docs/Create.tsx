import { FormEvent } from "react";
import { Head, Link, useForm } from "@nyalajs/inertia/client";
import { ArrowLeft } from "lucide-react";
import { DocsLayout } from "@/layouts/docs-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import type { NavGroup } from "../../types/docs";

interface Props {
    nav: NavGroup[];
    [key: string]: unknown;
}

/** A real INSERT into the docs table (DocsController.create()) — not a demo form. */
export default function DocsCreate({ nav }: Props) {
    const { data, setData, post, processing, errors } = useForm({
        slug: "",
        title: "",
        groupTitle: nav[0]?.title ?? "",
        sortOrder: "0",
        content: "",
    });

    function submit(e: FormEvent) {
        e.preventDefault();
        post("/docs");
    }

    return (
        <DocsLayout>
            <Head title="New Doc" />

            <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
                <div className="mb-4 flex items-center gap-3">
                    <Button asChild variant="ghost" size="icon">
                        <Link href="/" aria-label="Back to docs">
                            <ArrowLeft className="h-4 w-4" />
                        </Link>
                    </Button>
                    <h1 className="text-2xl font-semibold tracking-tight">New doc</h1>
                </div>

                <form onSubmit={submit}>
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">Doc details</CardTitle>
                            <CardDescription>Real fields, written straight into the docs table.</CardDescription>
                        </CardHeader>
                        <CardContent className="flex flex-col gap-5">
                            <div className="grid gap-2">
                                <Label htmlFor="title">Title</Label>
                                <Input
                                    id="title"
                                    value={data.title}
                                    onChange={(e) => setData("title", e.target.value)}
                                    aria-invalid={!!errors.title}
                                />
                                {errors.title && <p className="text-sm text-destructive">{errors.title}</p>}
                            </div>

                            <div className="grid gap-2">
                                <Label htmlFor="slug">Slug</Label>
                                <Input
                                    id="slug"
                                    value={data.slug}
                                    onChange={(e) => setData("slug", e.target.value)}
                                    placeholder="e.g. building-blocks/controllers"
                                    aria-invalid={!!errors.slug}
                                />
                                <p className="text-xs text-muted-foreground">
                                    Becomes the URL: /docs/{data.slug || "..."}
                                </p>
                                {errors.slug && <p className="text-sm text-destructive">{errors.slug}</p>}
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="grid gap-2">
                                    <Label htmlFor="groupTitle">Group</Label>
                                    <Input
                                        id="groupTitle"
                                        list="nav-groups"
                                        value={data.groupTitle}
                                        onChange={(e) => setData("groupTitle", e.target.value)}
                                        aria-invalid={!!errors.groupTitle}
                                    />
                                    <datalist id="nav-groups">
                                        {nav.map((group) => (
                                            <option key={group.title} value={group.title} />
                                        ))}
                                    </datalist>
                                    {errors.groupTitle && <p className="text-sm text-destructive">{errors.groupTitle}</p>}
                                </div>
                                <div className="grid gap-2">
                                    <Label htmlFor="sortOrder">Order</Label>
                                    <Input
                                        id="sortOrder"
                                        type="number"
                                        value={data.sortOrder}
                                        onChange={(e) => setData("sortOrder", e.target.value)}
                                        aria-invalid={!!errors.sortOrder}
                                    />
                                    {errors.sortOrder && <p className="text-sm text-destructive">{errors.sortOrder}</p>}
                                </div>
                            </div>

                            <div className="grid gap-2">
                                <Label htmlFor="content">Content (Markdown)</Label>
                                <Textarea
                                    id="content"
                                    rows={16}
                                    className="font-mono text-sm"
                                    value={data.content}
                                    onChange={(e) => setData("content", e.target.value)}
                                    aria-invalid={!!errors.content}
                                />
                                {errors.content && <p className="text-sm text-destructive">{errors.content}</p>}
                            </div>
                        </CardContent>
                        <CardFooter className="flex-wrap justify-end gap-2">
                            <Button type="button" variant="outline" asChild>
                                <Link href="/">Cancel</Link>
                            </Button>
                            <Button type="submit" disabled={processing}>
                                {processing ? "Creating..." : "Create doc"}
                            </Button>
                        </CardFooter>
                    </Card>
                </form>
            </div>
        </DocsLayout>
    );
}

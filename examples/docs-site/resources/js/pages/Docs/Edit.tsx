import { FormEvent } from "react";
import { Head, Link, useForm } from "@nyalajs/inertia/client";
import { ArrowLeft } from "lucide-react";
import { DocsLayout } from "@/layouts/docs-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import type { Doc, NavGroup } from "../../types/docs";

interface Props {
    doc: Doc;
    nav: NavGroup[];
    [key: string]: unknown;
}

/** A real UPDATE against the docs table (DocsController.update()) — the same row Docs/Show.tsx renders. */
export default function DocsEdit({ doc, nav }: Props) {
    const { data, setData, put, processing, errors } = useForm({
        slug: doc.slug,
        title: doc.title,
        groupTitle: doc.groupTitle,
        sortOrder: String(doc.sortOrder),
        content: doc.content,
    });

    function submit(e: FormEvent) {
        e.preventDefault();
        put(`/docs/${doc.slug}`);
    }

    return (
        <DocsLayout>
            <Head title={`Edit — ${doc.title}`} />

            <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
                <div className="mb-4 flex items-center gap-3">
                    <Button asChild variant="ghost" size="icon">
                        <Link href={`/docs/${doc.slug}`} aria-label="Back to doc">
                            <ArrowLeft className="h-4 w-4" />
                        </Link>
                    </Button>
                    <h1 className="text-2xl font-semibold tracking-tight">Edit doc</h1>
                </div>

                <form onSubmit={submit}>
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">Doc details</CardTitle>
                            <CardDescription>Real fields, updated straight in the docs table.</CardDescription>
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
                                    aria-invalid={!!errors.slug}
                                />
                                <p className="text-xs text-muted-foreground">
                                    Changing this changes the URL — links pointing at /docs/{doc.slug} will 404.
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
                                <Link href={`/docs/${doc.slug}`}>Cancel</Link>
                            </Button>
                            <Button type="submit" disabled={processing}>
                                {processing ? "Saving..." : "Save changes"}
                            </Button>
                        </CardFooter>
                    </Card>
                </form>
            </div>
        </DocsLayout>
    );
}

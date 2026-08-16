import { useState } from "react";
import { Head, Link, router } from "@nyalajs/inertia/client";
import { ArrowLeft, ArrowRight, Pencil, Trash2 } from "lucide-react";
import { DocsLayout } from "@/layouts/docs-layout";
import { DocsOutline } from "@/layouts/docs-outline";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import type { Doc, DocPage, NavGroup, NavItem } from "../../types/docs";

interface Props {
    slug: string;
    page: DocPage;
    doc: Doc;
    adjacent: { prev: NavItem | null; next: NavItem | null };
    nav: NavGroup[];
    [key: string]: unknown;
}

/**
 * Renders one real doc row from the database — page.html is the actual
 * Shiki-highlighted markdown output from DocsController.show() /
 * DocsService.render(), not placeholder content. Edit/Delete are real
 * writes against the same row (see DocsController.update()/destroy()),
 * not a demo. The right-hand "On this page" outline (DocsOutline) is
 * built from the same content's real headings and tracks scroll position
 * via IntersectionObserver, the same mechanism VitePress's own docs site
 * uses.
 */
export default function DocsShow({ page, doc, adjacent }: Props) {
    const [confirmingDelete, setConfirmingDelete] = useState(false);

    function destroy() {
        router.delete(`/docs/${doc.slug}`, { onFinish: () => setConfirmingDelete(false) });
    }

    return (
        <DocsLayout>
            <Head title={page.title} />

            <div className="flex gap-10 px-4 py-8 sm:px-6 lg:px-8">
                <article className="min-w-0 max-w-3xl flex-1">
                    <div className="mb-4 flex justify-end gap-2">
                        <Button asChild variant="outline" size="sm">
                            <Link href={`/edit/${doc.slug}`}>
                                <Pencil className="h-3.5 w-3.5" />
                                Edit
                            </Link>
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            onClick={() => setConfirmingDelete(true)}
                        >
                            <Trash2 className="h-3.5 w-3.5" />
                            Delete
                        </Button>
                    </div>

                    <div
                        className="prose prose-neutral max-w-none dark:prose-invert prose-headings:scroll-mt-24 prose-pre:bg-transparent prose-pre:p-0"
                        dangerouslySetInnerHTML={{ __html: page.html }}
                    />

                    <Separator className="my-8" />

                    <div className="flex flex-col gap-3 sm:flex-row sm:justify-between">
                        {adjacent.prev ? (
                            <Link
                                href={`/docs/${adjacent.prev.slug}`}
                                className="group flex flex-1 flex-col gap-1 rounded-lg border p-4 text-sm transition-colors hover:border-primary/50"
                            >
                                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                    <ArrowLeft className="h-3 w-3" /> Previous
                                </span>
                                <span className="font-medium group-hover:text-primary">{adjacent.prev.title}</span>
                            </Link>
                        ) : (
                            <div className="flex-1" />
                        )}
                        {adjacent.next ? (
                            <Link
                                href={`/docs/${adjacent.next.slug}`}
                                className="group flex flex-1 flex-col items-end gap-1 rounded-lg border p-4 text-right text-sm transition-colors hover:border-primary/50"
                            >
                                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                    Next <ArrowRight className="h-3 w-3" />
                                </span>
                                <span className="font-medium group-hover:text-primary">{adjacent.next.title}</span>
                            </Link>
                        ) : (
                            <div className="flex-1" />
                        )}
                    </div>
                </article>

                <DocsOutline headings={page.headings} />
            </div>

            <Dialog open={confirmingDelete} onOpenChange={setConfirmingDelete}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Delete "{doc.title}"</DialogTitle>
                        <DialogDescription>
                            This permanently removes the doc from the database. This can't be undone.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setConfirmingDelete(false)}>
                            Cancel
                        </Button>
                        <Button variant="destructive" onClick={destroy}>
                            Delete
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </DocsLayout>
    );
}

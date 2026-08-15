import { useState } from "react";
import { Head, Link, router } from "@nyalajs/inertia/client";
import { FileText, Pencil, Plus, Trash2 } from "lucide-react";
import { AdminLayout } from "@/layouts/admin-layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";

interface Post {
    id: string;
    title: string;
    body: string;
    published: boolean;
    authorId: string;
    createdAt: string;
    updatedAt: string;
}

interface Props {
    posts: Post[];
    [key: string]: unknown;
}

/**
 * The CRUD resource's index page. `posts` arrives as a controller-supplied
 * prop (app/controllers/posts.controller.ts's index() passes it as a lazy
 * thunk) — this component never fetches anything itself, the same "no
 * client-side data layer" property that's the whole point of Inertia.
 */
export default function Index({ posts }: Props) {
    const [pendingDelete, setPendingDelete] = useState<Post | null>(null);

    function confirmDelete() {
        if (!pendingDelete) return;
        router.delete(`/posts/${pendingDelete.id}`, {
            onFinish: () => setPendingDelete(null),
        });
    }

    return (
        <AdminLayout>
            <Head title="Posts" />

            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-2xl font-semibold tracking-tight">Posts</h1>
                    <p className="text-sm text-muted-foreground">Manage every post in one place.</p>
                </div>
                <Button asChild>
                    <Link href="/posts/create">
                        <Plus className="h-4 w-4" />
                        New post
                    </Link>
                </Button>
            </div>

            <Card className="mt-6">
                <CardHeader>
                    <CardTitle className="text-base">All posts</CardTitle>
                    <CardDescription>
                        {posts.length} post{posts.length === 1 ? "" : "s"} total
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {posts.length === 0 ? (
                        <div className="flex flex-col items-center gap-3 py-12 text-center">
                            <FileText className="h-10 w-10 text-muted-foreground/50" />
                            <p className="text-sm text-muted-foreground">No posts yet — create your first one.</p>
                            <Button asChild size="sm" variant="outline">
                                <Link href="/posts/create">New post</Link>
                            </Button>
                        </div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Title</TableHead>
                                    <TableHead className="hidden sm:table-cell">Status</TableHead>
                                    <TableHead className="hidden md:table-cell">Updated</TableHead>
                                    <TableHead className="w-0 text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {posts.map((post) => (
                                    <TableRow key={post.id}>
                                        <TableCell className="font-medium">
                                            <div className="flex flex-col">
                                                <span>{post.title}</span>
                                                <span className="text-xs text-muted-foreground sm:hidden">
                                                    {post.published ? "Published" : "Draft"}
                                                </span>
                                            </div>
                                        </TableCell>
                                        <TableCell className="hidden sm:table-cell">
                                            <Badge variant={post.published ? "success" : "secondary"}>
                                                {post.published ? "Published" : "Draft"}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="hidden text-muted-foreground md:table-cell">
                                            {new Date(post.updatedAt).toLocaleDateString()}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex justify-end gap-1">
                                                <Button asChild variant="ghost" size="icon">
                                                    <Link href={`/posts/${post.id}/edit`} aria-label={`Edit ${post.title}`}>
                                                        <Pencil className="h-4 w-4" />
                                                    </Link>
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="text-destructive hover:text-destructive"
                                                    aria-label={`Delete ${post.title}`}
                                                    onClick={() => setPendingDelete(post)}
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>

            <Dialog open={pendingDelete !== null} onOpenChange={(open) => !open && setPendingDelete(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Delete post</DialogTitle>
                        <DialogDescription>
                            Are you sure you want to delete “{pendingDelete?.title}”? This can't be undone.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setPendingDelete(null)}>
                            Cancel
                        </Button>
                        <Button variant="destructive" onClick={confirmDelete}>
                            Delete
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </AdminLayout>
    );
}

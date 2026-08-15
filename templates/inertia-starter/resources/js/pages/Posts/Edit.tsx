import { FormEvent } from "react";
import { Head, Link, useForm } from "@nyalajs/inertia/client";
import { ArrowLeft } from "lucide-react";
import { AdminLayout } from "@/layouts/admin-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

interface Post {
    id: string;
    title: string;
    body: string;
    published: boolean;
}

interface Props {
    post: Post;
    [key: string]: unknown;
}

export default function Edit({ post }: Props) {
    const { data, setData, put, processing, errors } = useForm({
        title: post.title,
        body: post.body,
        published: post.published,
    });

    function submit(e: FormEvent) {
        e.preventDefault();
        put(`/posts/${post.id}`);
    }

    return (
        <AdminLayout>
            <Head title={`Edit — ${post.title}`} />

            <div className="flex items-center gap-3">
                <Button asChild variant="ghost" size="icon">
                    <Link href="/posts" aria-label="Back to posts">
                        <ArrowLeft className="h-4 w-4" />
                    </Link>
                </Button>
                <h1 className="text-2xl font-semibold tracking-tight">Edit post</h1>
            </div>

            <form onSubmit={submit}>
                <Card className="mt-6 max-w-2xl">
                    <CardHeader>
                        <CardTitle className="text-base">Post details</CardTitle>
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
                            <Label htmlFor="body">Body</Label>
                            <Textarea
                                id="body"
                                rows={8}
                                value={data.body}
                                onChange={(e) => setData("body", e.target.value)}
                                aria-invalid={!!errors.body}
                            />
                            {errors.body && <p className="text-sm text-destructive">{errors.body}</p>}
                        </div>

                        <div className="flex items-center gap-2">
                            <Checkbox
                                id="published"
                                checked={data.published}
                                onCheckedChange={(checked) => setData("published", checked === true)}
                            />
                            <Label htmlFor="published" className="font-normal">
                                Published
                            </Label>
                        </div>
                    </CardContent>
                    <CardFooter className="flex-wrap justify-end gap-2">
                        <Button type="button" variant="outline" asChild>
                            <Link href="/posts">Cancel</Link>
                        </Button>
                        <Button type="submit" disabled={processing}>
                            {processing ? "Saving..." : "Update post"}
                        </Button>
                    </CardFooter>
                </Card>
            </form>
        </AdminLayout>
    );
}

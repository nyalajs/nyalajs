import { Head, Link } from "@nyalajs/inertia/client";
import { CheckCircle2, FileText, PenLine, Plus } from "lucide-react";
import { AdminLayout } from "@/layouts/admin-layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface Post {
    id: string;
    title: string;
    published: boolean;
    updatedAt: string;
}

interface Props {
    stats: { total: number; published: number; drafts: number };
    recentPosts: Post[];
    [key: string]: unknown;
}

const statCards = [
    { key: "total" as const, label: "Total posts", icon: FileText },
    { key: "published" as const, label: "Published", icon: CheckCircle2 },
    { key: "drafts" as const, label: "Drafts", icon: PenLine },
];

export default function DashboardIndex({ stats, recentPosts }: Props) {
    return (
        <AdminLayout>
            <Head title="Dashboard" />

            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
                    <p className="text-sm text-muted-foreground">An overview of your content.</p>
                </div>
                <Button asChild>
                    <Link href="/posts/create">
                        <Plus className="h-4 w-4" />
                        New post
                    </Link>
                </Button>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
                {statCards.map(({ key, label, icon: Icon }) => (
                    <Card key={key}>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
                            <Icon className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-3xl font-bold">{stats[key]}</div>
                        </CardContent>
                    </Card>
                ))}
            </div>

            <Card className="mt-4">
                <CardHeader>
                    <CardTitle className="text-base">Recent posts</CardTitle>
                    <CardDescription>The 5 most recently updated posts.</CardDescription>
                </CardHeader>
                <CardContent>
                    {recentPosts.length === 0 ? (
                        <p className="py-6 text-center text-sm text-muted-foreground">
                            No posts yet —{" "}
                            <Link href="/posts/create" className="font-medium text-primary underline-offset-4 hover:underline">
                                create your first one
                            </Link>
                            .
                        </p>
                    ) : (
                        <ul className="divide-y">
                            {recentPosts.map((post) => (
                                <li key={post.id} className="flex items-center justify-between gap-4 py-3">
                                    <Link
                                        href={`/posts/${post.id}/edit`}
                                        className="min-w-0 flex-1 truncate text-sm font-medium hover:underline"
                                    >
                                        {post.title}
                                    </Link>
                                    <Badge variant={post.published ? "success" : "secondary"}>
                                        {post.published ? "Published" : "Draft"}
                                    </Badge>
                                </li>
                            ))}
                        </ul>
                    )}
                </CardContent>
            </Card>
        </AdminLayout>
    );
}

import { Head, Link, router } from "@nyalajs/inertia/client";
import { Layout } from "../../components/Layout";

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
    function destroy(id: string) {
        if (!window.confirm("Delete this post?")) return;
        router.delete(`/posts/${id}`);
    }

    return (
        <Layout>
            <Head title="Posts" />
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                <h1>Posts</h1>
                <Link href="/posts/create">New post</Link>
            </div>

            {posts.length === 0 && <p>No posts yet.</p>}

            <ul style={{ listStyle: "none", padding: 0 }}>
                {posts.map((post) => (
                    <li
                        key={post.id}
                        style={{ borderBottom: "1px solid #e5e7eb", padding: "0.75rem 0", display: "flex", justifyContent: "space-between", alignItems: "center" }}
                    >
                        <div>
                            <strong>{post.title}</strong>{" "}
                            {!post.published && <span style={{ fontSize: "0.75rem", color: "#9ca3af" }}>(draft)</span>}
                        </div>
                        <div style={{ display: "flex", gap: "0.5rem" }}>
                            <Link href={`/posts/${post.id}/edit`}>Edit</Link>
                            <button onClick={() => destroy(post.id)}>Delete</button>
                        </div>
                    </li>
                ))}
            </ul>
        </Layout>
    );
}

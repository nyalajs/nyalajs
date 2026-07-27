import { AdminLayout } from "../admin-layout";
import { Post } from "../../models/post.model";

export interface PostsListPageProps {
    user: { name: string; role: string };
    posts: Post[];
}

export function PostsListPage({ user, posts }: PostsListPageProps) {
    return (
        <AdminLayout user={user} active="posts">
            <h1>Posts</h1>
            <p>
                <a className="btn btn-primary" href="/admin/posts/new">
                    + New post
                </a>
            </p>
            <table className="data-table">
                <thead>
                    <tr>
                        <th>Title</th>
                        <th>Slug</th>
                        <th>Status</th>
                        <th></th>
                    </tr>
                </thead>
                <tbody>
                    {posts.map((post) => (
                        <tr key={post.id}>
                            <td>{post.title}</td>
                            <td>{post.slug}</td>
                            <td>{post.status}</td>
                            <td className="actions">
                                <a className="btn" href={`/admin/posts/${post.id}/edit`}>
                                    Edit
                                </a>
                                <form method="POST" action={`/admin/posts/${post.id}/delete`}>
                                    <button type="submit" className="btn btn-danger">
                                        Delete
                                    </button>
                                </form>
                            </td>
                        </tr>
                    ))}
                    {posts.length === 0 && (
                        <tr>
                            <td colSpan={4}>No posts yet.</td>
                        </tr>
                    )}
                </tbody>
            </table>
        </AdminLayout>
    );
}

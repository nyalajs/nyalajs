import { AdminLayout } from "../admin-layout";
import { Post } from "../../models/post.model";
import { Category } from "../../models/category.model";

export interface PostFormPageProps {
    user: { name: string; role: string };
    post?: Post;
    categories: Category[];
    error?: string;
}

export function PostFormPage({ user, post, categories, error }: PostFormPageProps) {
    const action = post ? `/admin/posts/${post.id}` : "/admin/posts";

    return (
        <AdminLayout user={user} active="posts">
            <h1>{post ? `Edit "${post.title}"` : "New post"}</h1>
            {error && <p className="error-message">{error}</p>}
            <form method="POST" action={action} className="form-grid">
                <div>
                    <label htmlFor="title">Title</label>
                    <input id="title" name="title" defaultValue={post?.title} required />
                </div>
                <div>
                    <label htmlFor="slug">Slug</label>
                    <input id="slug" name="slug" defaultValue={post?.slug} required />
                </div>
                <div>
                    <label htmlFor="excerpt">Excerpt</label>
                    <textarea id="excerpt" name="excerpt" defaultValue={post?.excerpt ?? ""} rows={2} />
                </div>
                <div>
                    <label htmlFor="content">Content (HTML)</label>
                    <textarea id="content" name="content" defaultValue={post?.content ?? ""} rows={12} required />
                </div>
                <div>
                    <label htmlFor="coverImageUrl">Cover image URL</label>
                    <input id="coverImageUrl" name="coverImageUrl" defaultValue={post?.coverImageUrl ?? ""} />
                </div>
                <div>
                    <label htmlFor="categoryId">Category</label>
                    <select id="categoryId" name="categoryId" defaultValue={post?.categoryId ?? ""}>
                        <option value="">— None —</option>
                        {categories.map((c) => (
                            <option key={c.id} value={c.id}>
                                {c.name}
                            </option>
                        ))}
                    </select>
                </div>
                <div>
                    <label htmlFor="status">Status</label>
                    <select id="status" name="status" defaultValue={post?.status ?? "draft"}>
                        <option value="draft">Draft</option>
                        <option value="published">Published</option>
                    </select>
                </div>
                <div>
                    <label htmlFor="metaTitle">Meta title</label>
                    <input id="metaTitle" name="metaTitle" defaultValue={post?.metaTitle ?? ""} />
                </div>
                <div>
                    <label htmlFor="metaDescription">Meta description</label>
                    <textarea
                        id="metaDescription"
                        name="metaDescription"
                        defaultValue={post?.metaDescription ?? ""}
                        rows={3}
                    />
                </div>
                <button type="submit" className="btn btn-primary">
                    Save
                </button>
            </form>
        </AdminLayout>
    );
}

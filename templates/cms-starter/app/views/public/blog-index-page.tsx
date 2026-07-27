import { SiteLayout, SiteLayoutProps } from "../layout";
import { Post } from "../../models/post.model";

export interface BlogIndexPageProps {
    chrome: Omit<SiteLayoutProps, "children">;
    posts: Post[];
    page: number;
    totalPages: number;
}

export function BlogIndexPage({ chrome, posts, page, totalPages }: BlogIndexPageProps) {
    return (
        <SiteLayout {...chrome}>
            <h1>Blog</h1>
            <div className="post-list">
                {posts.map((post) => (
                    <article className="post-card" key={post.id}>
                        <h2>
                            <a href={`/blog/${post.slug}`}>{post.title}</a>
                        </h2>
                        <div className="meta">
                            {post.publishedAt ? new Date(post.publishedAt).toLocaleDateString() : ""}
                        </div>
                        {post.excerpt && <p>{post.excerpt}</p>}
                    </article>
                ))}
                {posts.length === 0 && <p>No posts yet.</p>}
            </div>
            {totalPages > 1 && (
                <nav className="pagination">
                    {page > 1 && <a href={`/blog?page=${page - 1}`}>&larr; Newer</a>}
                    {page < totalPages && <a href={`/blog?page=${page + 1}`}>Older &rarr;</a>}
                </nav>
            )}
        </SiteLayout>
    );
}

import { SiteLayout, SiteLayoutProps } from "../layout";
import { Post } from "../../models/post.model";

export interface BlogPostPageProps {
    chrome: Omit<SiteLayoutProps, "children">;
    post: Post;
    related: Post[];
}

export function BlogPostPage({ chrome, post, related }: BlogPostPageProps) {
    return (
        <SiteLayout {...chrome}>
            <article>
                <h1>{post.title}</h1>
                <div className="meta">{post.publishedAt ? new Date(post.publishedAt).toLocaleDateString() : ""}</div>
                {post.coverImageUrl && <img src={post.coverImageUrl} alt={post.title} style={{ maxWidth: "100%" }} />}
                <div dangerouslySetInnerHTML={{ __html: post.content }} />
            </article>

            {related.length > 0 && (
                <aside style={{ marginTop: "3rem" }}>
                    <h2>Related posts</h2>
                    <ul>
                        {related.map((p) => (
                            <li key={p.id}>
                                <a href={`/blog/${p.slug}`}>{p.title}</a>
                            </li>
                        ))}
                    </ul>
                </aside>
            )}
        </SiteLayout>
    );
}

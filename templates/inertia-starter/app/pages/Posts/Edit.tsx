import { FormEvent } from "react";
import { Head, useForm } from "@nyalajs/inertia/client";
import { Layout } from "../../components/Layout";

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
        <Layout>
            <Head title={`Edit — ${post.title}`} />
            <h1>Edit post</h1>

            <form onSubmit={submit}>
                <div style={{ marginBottom: "1rem" }}>
                    <label htmlFor="title">Title</label>
                    <input
                        id="title"
                        type="text"
                        value={data.title}
                        onChange={(e) => setData("title", e.target.value)}
                        style={{ display: "block", width: "100%", padding: "0.5rem" }}
                    />
                    {errors.title && <div style={{ color: "#dc2626" }}>{errors.title}</div>}
                </div>

                <div style={{ marginBottom: "1rem" }}>
                    <label htmlFor="body">Body</label>
                    <textarea
                        id="body"
                        rows={8}
                        value={data.body}
                        onChange={(e) => setData("body", e.target.value)}
                        style={{ display: "block", width: "100%", padding: "0.5rem" }}
                    />
                    {errors.body && <div style={{ color: "#dc2626" }}>{errors.body}</div>}
                </div>

                <div style={{ marginBottom: "1rem" }}>
                    <label>
                        <input
                            type="checkbox"
                            checked={data.published}
                            onChange={(e) => setData("published", e.target.checked)}
                        />{" "}
                        Published
                    </label>
                </div>

                <button type="submit" disabled={processing}>
                    {processing ? "Saving..." : "Update post"}
                </button>
            </form>
        </Layout>
    );
}

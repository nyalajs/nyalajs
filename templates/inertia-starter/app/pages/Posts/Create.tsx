import { FormEvent } from "react";
import { Head, useForm } from "@nyalajs/inertia/client";
import { Layout } from "../../components/Layout";

export default function Create() {
    const { data, setData, post, processing, errors } = useForm({
        title: "",
        body: "",
        published: false,
    });

    function submit(e: FormEvent) {
        e.preventDefault();
        post("/posts");
    }

    return (
        <Layout>
            <Head title="New post" />
            <h1>New post</h1>

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
                    {processing ? "Saving..." : "Create post"}
                </button>
            </form>
        </Layout>
    );
}

import { AdminLayout } from "../admin-layout";
import { Page } from "../../models/page.model";

export interface PageFormPageProps {
    user: { name: string; role: string };
    page?: Page;
    error?: string;
}

/**
 * Blocks are edited as raw JSON — see docs/cms-starter-spec.md's noted
 * simplification (a visual page builder is a project of its own).
 */
export function PageFormPage({ user, page, error }: PageFormPageProps) {
    const action = page ? `/admin/pages/${page.id}` : "/admin/pages";

    return (
        <AdminLayout user={user} active="pages">
            <h1>{page ? `Edit "${page.title}"` : "New page"}</h1>
            {error && <p className="error-message">{error}</p>}
            <form method="POST" action={action} className="form-grid">
                <div>
                    <label htmlFor="title">Title</label>
                    <input id="title" name="title" defaultValue={page?.title} required />
                </div>
                <div>
                    <label htmlFor="slug">Slug</label>
                    <input id="slug" name="slug" defaultValue={page?.slug} required />
                </div>
                <div>
                    <label htmlFor="status">Status</label>
                    <select id="status" name="status" defaultValue={page?.status ?? "draft"}>
                        <option value="draft">Draft</option>
                        <option value="published">Published</option>
                    </select>
                </div>
                <div>
                    <label htmlFor="blocksJson">Blocks (JSON)</label>
                    <textarea
                        id="blocksJson"
                        name="blocksJson"
                        defaultValue={JSON.stringify(page?.blocks ?? [], null, 2)}
                        rows={12}
                    />
                </div>
                <div>
                    <label htmlFor="metaTitle">Meta title</label>
                    <input id="metaTitle" name="metaTitle" defaultValue={page?.metaTitle ?? ""} />
                </div>
                <div>
                    <label htmlFor="metaDescription">Meta description</label>
                    <textarea
                        id="metaDescription"
                        name="metaDescription"
                        defaultValue={page?.metaDescription ?? ""}
                        rows={3}
                    />
                </div>
                <div>
                    <label htmlFor="ogImage">Social share image URL</label>
                    <input id="ogImage" name="ogImage" defaultValue={page?.ogImage ?? ""} />
                </div>
                <button type="submit" className="btn btn-primary">
                    Save
                </button>
            </form>
        </AdminLayout>
    );
}

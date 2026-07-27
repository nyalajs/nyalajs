import { AdminLayout } from "../admin-layout";

export interface TaxonomyItem {
    id: string;
    name: string;
    slug: string;
}

export interface TaxonomyPageProps {
    user: { name: string; role: string };
    active: string;
    title: string;
    basePath: string; // e.g. "/admin/categories"
    items: TaxonomyItem[];
    editing?: TaxonomyItem;
    error?: string;
}

/** Shared list+form page for the two simple name/slug resources: Category, Tag. */
export function TaxonomyPage({ user, active, title, basePath, items, editing, error }: TaxonomyPageProps) {
    return (
        <AdminLayout user={user} active={active}>
            <h1>{title}</h1>

            <table className="data-table" style={{ marginBottom: "2rem" }}>
                <thead>
                    <tr>
                        <th>Name</th>
                        <th>Slug</th>
                        <th></th>
                    </tr>
                </thead>
                <tbody>
                    {items.map((item) => (
                        <tr key={item.id}>
                            <td>{item.name}</td>
                            <td>{item.slug}</td>
                            <td className="actions">
                                <a className="btn" href={`${basePath}?edit=${item.id}`}>
                                    Edit
                                </a>
                                <form method="POST" action={`${basePath}/${item.id}/delete`}>
                                    <button type="submit" className="btn btn-danger">
                                        Delete
                                    </button>
                                </form>
                            </td>
                        </tr>
                    ))}
                    {items.length === 0 && (
                        <tr>
                            <td colSpan={3}>No items yet.</td>
                        </tr>
                    )}
                </tbody>
            </table>

            <div className="card">
                <h2>{editing ? `Edit "${editing.name}"` : "Add new"}</h2>
                {error && <p className="error-message">{error}</p>}
                <form
                    method="POST"
                    action={editing ? `${basePath}/${editing.id}` : basePath}
                    className="form-grid"
                >
                    <div>
                        <label htmlFor="name">Name</label>
                        <input id="name" name="name" defaultValue={editing?.name} required />
                    </div>
                    <div>
                        <label htmlFor="slug">Slug</label>
                        <input id="slug" name="slug" defaultValue={editing?.slug} required />
                    </div>
                    <button type="submit" className="btn btn-primary">
                        {editing ? "Save" : "Create"}
                    </button>
                </form>
            </div>
        </AdminLayout>
    );
}

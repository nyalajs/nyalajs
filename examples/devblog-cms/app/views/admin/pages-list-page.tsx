import { AdminLayout } from "../admin-layout";
import { Page } from "../../models/page.model";

export interface PagesListPageProps {
    user: { name: string; role: string };
    pages: Page[];
}

export function PagesListPage({ user, pages }: PagesListPageProps) {
    return (
        <AdminLayout user={user} active="pages">
            <h1>Pages</h1>
            <p>
                <a className="btn btn-primary" href="/admin/pages/new">
                    + New page
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
                    {pages.map((page) => (
                        <tr key={page.id}>
                            <td>{page.title}</td>
                            <td>/{page.slug === "home" ? "" : page.slug}</td>
                            <td>{page.status}</td>
                            <td className="actions">
                                <a className="btn" href={`/admin/pages/${page.id}/edit`}>
                                    Edit
                                </a>
                                <form method="POST" action={`/admin/pages/${page.id}/delete`}>
                                    <button type="submit" className="btn btn-danger">
                                        Delete
                                    </button>
                                </form>
                            </td>
                        </tr>
                    ))}
                    {pages.length === 0 && (
                        <tr>
                            <td colSpan={4}>No pages yet.</td>
                        </tr>
                    )}
                </tbody>
            </table>
        </AdminLayout>
    );
}

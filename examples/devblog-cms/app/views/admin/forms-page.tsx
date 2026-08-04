import { AdminLayout } from "../admin-layout";
import { FormSubmission } from "../../models/form-submission.model";

export interface FormsPageProps {
    user: { name: string; role: string };
    submissions: FormSubmission[];
}

export function FormsPage({ user, submissions }: FormsPageProps) {
    return (
        <AdminLayout user={user} active="forms">
            <h1>Form submissions</h1>
            <table className="data-table">
                <thead>
                    <tr>
                        <th>Form</th>
                        <th>Data</th>
                        <th>Received</th>
                        <th></th>
                    </tr>
                </thead>
                <tbody>
                    {submissions.map((s) => (
                        <tr key={s.id} style={{ fontWeight: s.read ? "normal" : 700 }}>
                            <td>{s.formName}</td>
                            <td>
                                <code style={{ fontSize: "0.8rem" }}>{JSON.stringify(s.data)}</code>
                            </td>
                            <td>{new Date(s.createdAt).toLocaleString()}</td>
                            <td className="actions">
                                {!s.read && (
                                    <form method="POST" action={`/admin/forms/${s.id}/read`}>
                                        <button type="submit" className="btn">
                                            Mark read
                                        </button>
                                    </form>
                                )}
                                <form method="POST" action={`/admin/forms/${s.id}/delete`}>
                                    <button type="submit" className="btn btn-danger">
                                        Delete
                                    </button>
                                </form>
                            </td>
                        </tr>
                    ))}
                    {submissions.length === 0 && (
                        <tr>
                            <td colSpan={4}>No submissions yet.</td>
                        </tr>
                    )}
                </tbody>
            </table>
        </AdminLayout>
    );
}

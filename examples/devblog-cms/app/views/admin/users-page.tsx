import { AdminLayout } from "../admin-layout";
import { User } from "../../models/user.model";

export interface UsersPageProps {
    user: { name: string; role: string };
    users: Omit<User, "password">[];
    error?: string;
}

export function UsersPage({ user, users, error }: UsersPageProps) {
    return (
        <AdminLayout user={user} active="users">
            <h1>Users</h1>
            <table className="data-table" style={{ marginBottom: "2rem" }}>
                <thead>
                    <tr>
                        <th>Name</th>
                        <th>Email</th>
                        <th>Role</th>
                        <th></th>
                    </tr>
                </thead>
                <tbody>
                    {users.map((u) => (
                        <tr key={u.id}>
                            <td>{u.name}</td>
                            <td>{u.email}</td>
                            <td>{u.role}</td>
                            <td className="actions">
                                <form method="POST" action={`/admin/users/${u.id}/delete`}>
                                    <button type="submit" className="btn btn-danger">
                                        Remove
                                    </button>
                                </form>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>

            <div className="card">
                <h2>Add user</h2>
                {error && <p className="error-message">{error}</p>}
                <form method="POST" action="/admin/users" className="form-grid">
                    <div>
                        <label htmlFor="name">Name</label>
                        <input id="name" name="name" required />
                    </div>
                    <div>
                        <label htmlFor="email">Email</label>
                        <input id="email" name="email" type="email" required />
                    </div>
                    <div>
                        <label htmlFor="password">Password</label>
                        <input id="password" name="password" type="password" required />
                    </div>
                    <div>
                        <label htmlFor="role">Role</label>
                        <select id="role" name="role" defaultValue="editor">
                            <option value="admin">Admin</option>
                            <option value="editor">Editor</option>
                            <option value="viewer">Viewer</option>
                        </select>
                    </div>
                    <button type="submit" className="btn btn-primary">
                        Create
                    </button>
                </form>
            </div>
        </AdminLayout>
    );
}

import { AdminLayout } from "../admin-layout";

export interface DashboardPageProps {
    user: { name: string; role: string };
    stats: {
        publishedPages: number;
        publishedPosts: number;
        unreadSubmissions: number;
        mediaCount: number;
    };
}

export function DashboardPage({ user, stats }: DashboardPageProps) {
    return (
        <AdminLayout user={user} active="dashboard">
            <h1>Dashboard</h1>
            <div className="stat-grid">
                <div className="stat-card">
                    <div className="value">{stats.publishedPages}</div>
                    <div className="label">Published pages</div>
                </div>
                <div className="stat-card">
                    <div className="value">{stats.publishedPosts}</div>
                    <div className="label">Published posts</div>
                </div>
                <div className="stat-card">
                    <div className="value">{stats.unreadSubmissions}</div>
                    <div className="label">Unread submissions</div>
                </div>
                <div className="stat-card">
                    <div className="value">{stats.mediaCount}</div>
                    <div className="label">Media files</div>
                </div>
            </div>
            <div className="card">
                <p>
                    Welcome back, {user.name}. Use the sidebar to manage pages, posts, media, menus, and site
                    settings.
                </p>
            </div>
        </AdminLayout>
    );
}

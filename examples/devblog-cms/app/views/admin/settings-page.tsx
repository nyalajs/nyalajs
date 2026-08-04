import { AdminLayout } from "../admin-layout";

export interface SettingsPageProps {
    user: { name: string; role: string };
    settings: {
        siteName: string;
        siteDescription: string;
        contactEmail: string;
        footerText: string;
        maintenanceMode: boolean;
    };
    saved?: boolean;
}

export function SettingsPage({ user, settings, saved }: SettingsPageProps) {
    return (
        <AdminLayout user={user} active="settings">
            <h1>Settings</h1>
            {saved && <p style={{ color: "#059669" }}>Saved.</p>}
            <form method="POST" action="/admin/settings" className="form-grid">
                <div>
                    <label htmlFor="siteName">Site name</label>
                    <input id="siteName" name="siteName" defaultValue={settings.siteName} required />
                </div>
                <div>
                    <label htmlFor="siteDescription">Site description</label>
                    <textarea id="siteDescription" name="siteDescription" defaultValue={settings.siteDescription} rows={2} />
                </div>
                <div>
                    <label htmlFor="contactEmail">Contact email</label>
                    <input id="contactEmail" name="contactEmail" type="email" defaultValue={settings.contactEmail} />
                </div>
                <div>
                    <label htmlFor="footerText">Footer text</label>
                    <input id="footerText" name="footerText" defaultValue={settings.footerText} />
                </div>
                <div>
                    <label>
                        <input
                            type="checkbox"
                            name="maintenanceMode"
                            defaultChecked={settings.maintenanceMode}
                            style={{ width: "auto", marginRight: "0.5rem" }}
                        />
                        Maintenance mode
                    </label>
                </div>
                <button type="submit" className="btn btn-primary">
                    Save
                </button>
            </form>
        </AdminLayout>
    );
}

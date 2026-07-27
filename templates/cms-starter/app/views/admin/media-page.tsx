import { AdminLayout } from "../admin-layout";
import { Media } from "../../models/media.model";
import { island } from "@nyalajs/react";

export interface MediaPageProps {
    user: { name: string; role: string };
    media: Media[];
}

export function MediaPage({ user, media }: MediaPageProps) {
    return (
        <AdminLayout user={user} active="media">
            <h1>Media</h1>

            {island("MediaUploader", {})}

            <div className="media-grid" style={{ marginTop: "1.5rem" }}>
                {media.map((item) => (
                    <div className="media-item" key={item.id}>
                        {item.mimeType.startsWith("image/") ? (
                            <img src={item.url} alt={item.altText ?? ""} />
                        ) : (
                            <div style={{ height: 100, display: "flex", alignItems: "center", justifyContent: "center" }}>
                                {item.mimeType}
                            </div>
                        )}
                        <div className="media-meta">
                            <div>{item.filename}</div>
                            <form method="POST" action={`/admin/media/${item.id}/delete`}>
                                <button type="submit" className="btn btn-danger" style={{ marginTop: "0.4rem" }}>
                                    Delete
                                </button>
                            </form>
                        </div>
                    </div>
                ))}
            </div>
            {media.length === 0 && <p>No media uploaded yet.</p>}
        </AdminLayout>
    );
}

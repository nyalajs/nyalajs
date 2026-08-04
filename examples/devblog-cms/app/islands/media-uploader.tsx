import * as React from "react";

interface UploadItem {
    file: File;
    progress: number;
    status: "pending" | "uploading" | "done" | "error";
}

/**
 * Multi-file upload with real per-file progress — the one thing a plain
 * <input type="file"> form can't do (no upload-progress events from a
 * normal form submit), so it's an island. Uses XMLHttpRequest, not fetch —
 * fetch has no upload-progress event.
 */
export default function MediaUploader() {
    const [items, setItems] = React.useState<UploadItem[]>([]);
    const inputRef = React.useRef<HTMLInputElement>(null);

    function handleFiles(fileList: FileList | null) {
        if (!fileList) return;
        const newItems: UploadItem[] = Array.from(fileList).map((file) => ({
            file,
            progress: 0,
            status: "pending",
        }));
        setItems((prev) => [...prev, ...newItems]);
        newItems.forEach(upload);
    }

    function upload(item: UploadItem) {
        const formData = new FormData();
        formData.append("file", item.file);

        const xhr = new XMLHttpRequest();
        xhr.open("POST", "/admin/media/upload");

        xhr.upload.onprogress = (event) => {
            if (!event.lengthComputable) return;
            const progress = Math.round((event.loaded / event.total) * 100);
            setItems((prev) => prev.map((i) => (i.file === item.file ? { ...i, progress, status: "uploading" } : i)));
        };

        xhr.onload = () => {
            const ok = xhr.status >= 200 && xhr.status < 300;
            setItems((prev) =>
                prev.map((i) => (i.file === item.file ? { ...i, status: ok ? "done" : "error", progress: 100 } : i))
            );
            if (ok) {
                // Full reload picks up the new item in the server-rendered
                // media grid below — simplest way to stay in sync without
                // building a second, client-side rendering path for the grid.
                setTimeout(() => window.location.reload(), 400);
            }
        };

        xhr.onerror = () => {
            setItems((prev) => prev.map((i) => (i.file === item.file ? { ...i, status: "error" } : i)));
        };

        xhr.send(formData);
    }

    return (
        <div className="media-uploader">
            <div
                className="card"
                style={{ borderStyle: "dashed", textAlign: "center", cursor: "pointer" }}
                onClick={() => inputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                    e.preventDefault();
                    handleFiles(e.dataTransfer.files);
                }}
            >
                <p>Drag files here, or click to choose files</p>
                <input
                    ref={inputRef}
                    type="file"
                    multiple
                    style={{ display: "none" }}
                    onChange={(e) => handleFiles(e.target.files)}
                />
            </div>

            {items.length > 0 && (
                <ul style={{ listStyle: "none", padding: 0, marginTop: "1rem" }}>
                    {items.map((item, i) => (
                        <li key={i} style={{ marginBottom: "0.5rem" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem" }}>
                                <span>{item.file.name}</span>
                                <span>{item.status === "error" ? "Failed" : `${item.progress}%`}</span>
                            </div>
                            <div style={{ background: "#e5e7eb", borderRadius: 4, height: 6 }}>
                                <div
                                    style={{
                                        width: `${item.progress}%`,
                                        background: item.status === "error" ? "#dc2626" : "#4f46e5",
                                        height: "100%",
                                        borderRadius: 4,
                                        transition: "width 0.2s",
                                    }}
                                />
                            </div>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

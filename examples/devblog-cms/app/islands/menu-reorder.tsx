import * as React from "react";

export interface MenuReorderItem {
    id: string;
    label: string;
}

export interface MenuReorderProps {
    menuId: string;
    items: MenuReorderItem[];
}

/**
 * Drag-and-drop reordering for a flat list of menu items — native HTML5
 * drag events, no external DnD library needed for a single flat list.
 * Posts the new order to the existing menu-item update endpoint on drop.
 */
export default function MenuReorder({ menuId, items: initialItems }: MenuReorderProps) {
    const [items, setItems] = React.useState(initialItems);
    const dragIndex = React.useRef<number | null>(null);
    const [saved, setSaved] = React.useState(true);

    function handleDrop(dropIndex: number) {
        const from = dragIndex.current;
        if (from === null || from === dropIndex) return;

        setItems((prev) => {
            const next = [...prev];
            const [moved] = next.splice(from, 1);
            next.splice(dropIndex, 0, moved);
            return next;
        });
        dragIndex.current = null;
        setSaved(false);
    }

    React.useEffect(() => {
        if (saved) return;
        const timeout = setTimeout(async () => {
            await fetch(`/admin/menus/${menuId}/reorder`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ itemIds: items.map((i) => i.id) }),
            });
            setSaved(true);
        }, 400);
        return () => clearTimeout(timeout);
    }, [items, saved, menuId]);

    return (
        <ul style={{ listStyle: "none", padding: 0, maxWidth: "28rem" }}>
            {items.map((item, index) => (
                <li
                    key={item.id}
                    draggable
                    onDragStart={() => (dragIndex.current = index)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => handleDrop(index)}
                    className="card"
                    style={{ marginBottom: "0.4rem", cursor: "grab", display: "flex", alignItems: "center", gap: "0.5rem" }}
                >
                    <span aria-hidden>⠿</span> {item.label}
                </li>
            ))}
            <li style={{ fontSize: "0.8rem", color: "#6b7280", marginTop: "0.5rem" }}>
                {saved ? "Saved" : "Saving…"}
            </li>
        </ul>
    );
}

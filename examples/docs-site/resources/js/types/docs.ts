export interface NavItem {
    title: string;
    slug: string;
}

export interface NavGroup {
    title: string;
    items: NavItem[];
}

export interface DocHeading {
    depth: number;
    text: string;
    id: string;
}

export interface DocPage {
    title: string;
    html: string;
    headings: DocHeading[];
}

/** A real row from the docs table (app/models/doc.model.ts) — the raw, editable record behind a rendered DocPage. */
export interface Doc {
    id: string;
    slug: string;
    title: string;
    groupTitle: string;
    sortOrder: number;
    content: string;
    createdAt: string;
    updatedAt: string;
}

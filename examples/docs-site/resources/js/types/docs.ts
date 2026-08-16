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

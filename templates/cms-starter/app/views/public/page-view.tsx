import { SiteLayout, SiteLayoutProps } from "../layout";
import { BlockRenderer } from "../blocks/block-renderer";
import { Page } from "../../models/page.model";

export interface PageViewProps {
    chrome: Omit<SiteLayoutProps, "children">;
    page: Page;
}

export function PageView({ chrome, page }: PageViewProps) {
    return (
        <SiteLayout {...chrome}>
            <BlockRenderer blocks={page.blocks} />
        </SiteLayout>
    );
}

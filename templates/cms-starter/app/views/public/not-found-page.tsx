import { SiteLayout, SiteLayoutProps } from "../layout";

export interface NotFoundPageProps {
    chrome: Omit<SiteLayoutProps, "children">;
}

export function NotFoundPage({ chrome }: NotFoundPageProps) {
    return (
        <SiteLayout {...chrome}>
            <h1>Page not found</h1>
            <p>
                The page you're looking for doesn't exist. <a href="/">Go home</a>.
            </p>
        </SiteLayout>
    );
}

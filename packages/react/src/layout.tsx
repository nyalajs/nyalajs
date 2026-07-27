import * as React from "react";

export interface LayoutProps {
    title?: string;
    meta?: Record<string, string>;
    children: React.ReactNode;
}

/**
 * Minimal HTML document shell used when a ViewOptions.layout isn't given.
 * Apps typically supply their own layout (nav/footer/CSS links) instead.
 */
export function DefaultLayout({ title, meta, children }: LayoutProps): React.ReactElement {
    return (
        <html lang="en">
            <head>
                <meta charSet="utf-8" />
                <meta name="viewport" content="width=device-width, initial-scale=1" />
                {title && <title>{title}</title>}
                {meta &&
                    Object.entries(meta).map(([name, content]) => (
                        <meta key={name} name={name} content={content} />
                    ))}
            </head>
            <body>{children}</body>
        </html>
    );
}

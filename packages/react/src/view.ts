import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { RenderableResponse } from "@nyalajs/http";
import { DefaultLayout, LayoutProps } from "./layout";
import { IslandTrackingContext } from "./islands/context";
import { getIslandFileManifest } from "./islands/manifest-cache";

export interface ViewOptions {
    title?: string;
    meta?: Record<string, string>;
    statusCode?: number;
    layout?: React.ComponentType<LayoutProps>;
}

/**
 * Marker object a controller returns instead of plain data. FastifyAdapter
 * detects this shape (via @nyalajs/http's RenderableResponse interface) and
 * sends the rendered HTML instead of JSON-serializing it.
 *
 * Server-rendered by default (react-dom/server) — zero client JS unless the
 * view uses island(name, props) somewhere, in which case the hydration
 * bootstrap script is appended automatically. A view with no islands ships
 * no JS at all.
 */
export class ViewResponse<P = any> implements RenderableResponse {
    readonly contentType = "text/html";
    readonly statusCode?: number;

    constructor(
        private readonly component: React.ComponentType<P>,
        private readonly props: P,
        private readonly options: ViewOptions = {}
    ) {
        this.statusCode = options.statusCode;
    }

    render(): string {
        const Layout = (this.options.layout ?? DefaultLayout) as React.ComponentType<any>;
        const Component = this.component as React.ComponentType<any>;

        let usedIslands: string[] = [];
        const html = IslandTrackingContext.run(() => {
            const markup = renderToStaticMarkup(
                React.createElement(Layout, {
                    title: this.options.title,
                    meta: this.options.meta,
                    children: React.createElement(Component, this.props as any),
                })
            );
            usedIslands = IslandTrackingContext.used;
            return markup;
        });

        let withBootstrap = html;
        if (usedIslands.length > 0) {
            const fileManifest = getIslandFileManifest();
            if (!fileManifest) {
                throw new Error(
                    `View uses island(s) [${usedIslands.join(", ")}] but no island bundle manifest is loaded. ` +
                    `Run \`nyala build\` (or \`nyala dev\`) to bundle islands, and make sure registerIslands() ` +
                    `was called with the same staticDir passed to FastifyAdapter.`
                );
            }
            const script = `<script type="module" src="/public/${fileManifest.bootstrap}"></script>`;
            withBootstrap = html.replace("</body>", `${script}</body>`);
        }

        return `<!DOCTYPE html>${withBootstrap}`;
    }
}

export function view<P>(
    component: React.ComponentType<P>,
    props: P,
    options?: ViewOptions
): ViewResponse<P> {
    return new ViewResponse(component, props, options);
}

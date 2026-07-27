/**
 * A response that has already been rendered to a string (e.g. HTML from
 * @nyalajs/react's `view()`), instead of a plain object to JSON-serialize.
 * `@nyalajs/http` never imports a rendering package itself — this is a
 * duck-typed interface so any renderer can plug in without adding a
 * dependency on the framework's core HTTP layer.
 */
export interface RenderableResponse {
    render(): string | Promise<string>;
    /** Defaults to "text/html" if omitted. */
    contentType?: string;
    /** Defaults to 200 if omitted. */
    statusCode?: number;
}

export function isRenderable(value: any): value is RenderableResponse {
    return value != null && typeof value.render === "function";
}

import { RenderableResponse } from "@nyalajs/http";
import {
    Errors,
    InertiaPage,
    InertiaRequestLike,
    INERTIA_ERROR_BAG_HEADER,
    INERTIA_HEADER,
    INERTIA_LOCATION_HEADER,
    INERTIA_PARTIAL_COMPONENT_HEADER,
    INERTIA_PARTIAL_DATA_HEADER,
    INERTIA_PARTIAL_EXCEPT_HEADER,
    INERTIA_VERSION_HEADER,
} from "./types";
import { getSharedProps } from "./shared-props";
import { consumeFlash, consumeValidationErrors, FlashRequestLike } from "./flash";
import { renderRootHtml, RootHtmlOptions } from "./html-shell";

export interface InertiaResponseRequest extends InertiaRequestLike, FlashRequestLike {
    __inertiaShared?: Record<string, unknown>;
}

/**
 * Minimal shape InertiaResponse needs from the outgoing reply — just enough
 * to set the X-Inertia-Location header on a 409 before FastifyAdapter calls
 * .send() (packages/http/src/runtime/fastify-adapter.ts:423-435 only reads
 * .statusCode/.contentType/.render() off a RenderableResponse, nothing
 * about extra headers, so InertiaResponse sets this one itself — same
 * pattern as a controller using @Res() to call reply.header() directly).
 * Duck-typed so it's trivially fakeable in tests without a real Fastify reply.
 */
export interface InertiaResponseReply {
    header(name: string, value: string): unknown;
}

export interface InertiaResponseOptions {
    /** Current asset version — compared against the client's X-Inertia-Version header. */
    version: string | null;
    /** Options forwarded to the HTML shell renderer for non-Inertia (full page load) requests. */
    html: RootHtmlOptions;
    /**
     * The outgoing reply, used only to set X-Inertia-Location on a 409
     * version-mismatch response. Optional — omitting it just means a 409
     * response won't carry that header (the client fallback would then be
     * unable to distinguish "stale version" from any other 409).
     */
    reply?: InertiaResponseReply;
}

/**
 * A prop value can be a thunk — evaluated lazily, and skipped entirely
 * during a partial reload that doesn't ask for it. This is the same
 * "lazy/optional prop" idea Inertia's official server adapters provide
 * (Laravel's `Inertia::lazy()`); it matters here because Nyala controllers
 * often build props from DB calls that shouldn't run on every partial
 * reload of an unrelated prop.
 */
export type InertiaPropValue = unknown | (() => unknown | Promise<unknown>);
export type InertiaProps = Record<string, InertiaPropValue>;

/**
 * The core Inertia protocol response. Implements @nyalajs/http's
 * RenderableResponse duck type (packages/http/src/response/renderable.interface.ts)
 * so FastifyAdapter's existing isRenderable() branch
 * (packages/http/src/runtime/fastify-adapter.ts:423-435) picks it up with
 * zero framework changes — same seam @nyalajs/react's ViewResponse uses.
 *
 * Handles, for real, per @inertiajs/core@2.3.27's verified protocol:
 *   - X-Inertia header branching: JSON page object for XHR/fetch requests
 *     from the Inertia client, full HTML shell for hard navigation/first load.
 *   - X-Inertia-Version mismatch -> 409 + X-Inertia-Location (forces the
 *     client to do a full browser reload instead of an in-place swap; see
 *     @inertiajs/core's hasStatus(409) && hasHeader("x-inertia-location")
 *     check, confirmed in its compiled dist).
 *   - Partial reloads: X-Inertia-Partial-Component + (X-Inertia-Partial-Data
 *     | X-Inertia-Partial-Except) narrow which props are actually evaluated
 *     and included.
 *   - errors/flash merged into props automatically (errors keyed by
 *     X-Inertia-Error-Bag when present, matching Inertia's ErrorBag shape).
 */
export class InertiaResponse implements RenderableResponse {
    statusCode?: number;

    constructor(
        private readonly component: string,
        private readonly props: InertiaProps,
        private readonly request: InertiaResponseRequest,
        private readonly options: InertiaResponseOptions
    ) {}

    get contentType(): string {
        return this.isInertiaRequest() ? "application/json" : "text/html";
    }

    private header(name: string): string | undefined {
        const value = this.request.headers[name];
        return Array.isArray(value) ? value[0] : value;
    }

    private isInertiaRequest(): boolean {
        return this.header(INERTIA_HEADER) === "true";
    }

    /**
     * True when the client's asset version doesn't match the server's
     * current one. Only meaningful for genuine Inertia (XHR) requests — a
     * hard navigation always gets the current version embedded fresh, so
     * there's nothing to be "stale" relative to.
     */
    private isVersionMismatch(): boolean {
        if (!this.isInertiaRequest()) return false;
        const clientVersion = this.header(INERTIA_VERSION_HEADER) ?? null;
        return clientVersion !== (this.options.version ?? null);
    }

    private partialComponent(): string | undefined {
        return this.header(INERTIA_PARTIAL_COMPONENT_HEADER);
    }

    private partialOnly(): string[] | null {
        const raw = this.header(INERTIA_PARTIAL_DATA_HEADER);
        return raw ? raw.split(",").filter(Boolean) : null;
    }

    private partialExcept(): string[] | null {
        const raw = this.header(INERTIA_PARTIAL_EXCEPT_HEADER);
        return raw ? raw.split(",").filter(Boolean) : null;
    }

    /**
     * Resolves this response's props down to plain values, honoring
     * partial-reload filtering. Partial reloads only apply when the
     * requested component matches this response's component — Inertia
     * sends X-Inertia-Partial-Component so the server can tell "reload just
     * these props of the page I'm already on" apart from "navigating to a
     * different page that happens to reuse a prop name".
     */
    private async resolveProps(): Promise<Record<string, unknown>> {
        const isPartial = this.isInertiaRequest() && this.partialComponent() === this.component;
        const only = isPartial ? this.partialOnly() : null;
        const except = isPartial ? this.partialExcept() : null;

        const keys = Object.keys(this.props).filter((key) => {
            if (only && only.length > 0) return only.includes(key);
            if (except && except.length > 0) return !except.includes(key);
            return true;
        });

        const resolved: Record<string, unknown> = {};
        for (const key of keys) {
            const value = this.props[key];
            resolved[key] = typeof value === "function" ? await (value as () => unknown)() : value;
        }

        return resolved;
    }

    private resolveErrors(): Errors {
        // Validation errors travel via a session flash (see
        // flashValidationErrors()/consumeValidationErrors() in flash.ts) —
        // the real Inertia pattern is a controller redirecting (303) back
        // to the form page after a validation failure, with errors carried
        // in the session rather than rendered same-request.
        const flashedErrors = consumeValidationErrors(this.request) as Errors;
        const errorBag = this.header(INERTIA_ERROR_BAG_HEADER);

        // Bagged errors are namespaced under the bag name per Inertia's
        // protocol (multiple forms on one page can't stomp each other's
        // errors) — the client reads props.errors[bagName] in that case.
        if (errorBag && Object.keys(flashedErrors).length > 0) {
            return { [errorBag]: flashedErrors } as unknown as Errors;
        }
        return flashedErrors;
    }

    private async buildPage(): Promise<InertiaPage> {
        const shared = getSharedProps(this.request);
        const ownProps = await this.resolveProps();
        const flashProps = consumeFlash(this.request);

        return {
            component: this.component,
            props: {
                // Shared props (current user, etc.) merge first, so a
                // same-named per-response prop always wins — an explicit
                // inertia(req, ..., {user}) call should never be silently
                // overridden by ambient shared state.
                ...shared,
                ...ownProps,
                flash: flashProps,
                errors: this.resolveErrors(),
            } as InertiaPage["props"],
            url: this.request.url ?? "/",
            version: this.options.version ?? null,
            clearHistory: false,
            encryptHistory: false,
        };
    }

    async render(): Promise<string> {
        if (this.isVersionMismatch()) {
            // Real Inertia protocol: a 409 with X-Inertia-Location tells the
            // client "don't try to swap this in via XHR, do a full browser
            // navigation to this URL instead" — verified against
            // @inertiajs/core@2.3.27's hasStatus(409) && hasHeader("x-inertia-location")
            // check in its compiled dist/index.js.
            this.statusCode = 409;
            this.options.reply?.header(INERTIA_LOCATION_HEADER, this.request.url ?? "/");
            return "";
        }

        const page = await this.buildPage();

        if (this.isInertiaRequest()) {
            return JSON.stringify(page);
        }

        // Full HTML on first load / hard navigation: root div with the page
        // object serialized into a data-page attribute (verified against
        // @inertiajs/react@2.3.27's createInertiaApp, which reads exactly
        // this convention — el.dataset.page, JSON.parse'd), plus script
        // tags pointing at Vite (dev server in dev, hashed manifest
        // entries in prod).
        return renderRootHtml(page, this.options.html);
    }
}

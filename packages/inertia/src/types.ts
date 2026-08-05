/**
 * The real Inertia "Page" object shape, verified against
 * @inertiajs/core@2.3.27's compiled types/types.d.ts (node_modules after
 * installing it — see packages/inertia/README.md for how to re-verify).
 * Duck-typed here instead of imported from @inertiajs/core so this package's
 * server-side entry point (imported by every controller) doesn't pull in a
 * client-oriented dependency at Node runtime — only its types are needed.
 */
export interface Errors {
    [key: string]: string | string[] | undefined;
}

export interface ErrorBag {
    [bag: string]: Errors;
}

export interface FlashData {
    [key: string]: unknown;
}

export interface InertiaPage {
    component: string;
    props: Record<string, unknown> & {
        errors: Errors;
    };
    url: string;
    version: string | null;
    clearHistory: boolean;
    encryptHistory: boolean;
}

/**
 * Real Inertia request headers, verified against @inertiajs/core@2.3.27's
 * compiled dist/index.js (grep for "X-Inertia" — see the citations in
 * docs/inertia-starter-spec.md's Open Question #4 resolution).
 */
export const INERTIA_HEADER = "x-inertia";
export const INERTIA_VERSION_HEADER = "x-inertia-version";
export const INERTIA_LOCATION_HEADER = "X-Inertia-Location";
export const INERTIA_PARTIAL_COMPONENT_HEADER = "x-inertia-partial-component";
export const INERTIA_PARTIAL_DATA_HEADER = "x-inertia-partial-data";
export const INERTIA_PARTIAL_EXCEPT_HEADER = "x-inertia-partial-except";
export const INERTIA_RESET_HEADER = "x-inertia-reset";
export const INERTIA_ERROR_BAG_HEADER = "x-inertia-error-bag";

/**
 * Minimal shape InertiaResponse needs from an incoming request — just the
 * headers, duck-typed so it works against FastifyRequest without a hard
 * dependency on fastify's types, and is trivially fakeable in tests.
 */
export interface InertiaRequestLike {
    headers: Record<string, string | string[] | undefined>;
    url?: string;
}

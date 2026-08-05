/**
 * Nyala's own equivalent of laravel-vite-plugin's `resolvePageComponent`
 * helper — deliberately not a dependency on laravel-vite-plugin itself
 * (wrong framework, confusing package name for Nyala users). The real
 * implementation is genuinely a few lines: given the object Vite's
 * `import.meta.glob()` produces (keyed by file path, valued by an
 * import()-returning thunk in eager: false mode, or the module itself in
 * eager: true mode), find the entry whose path ends with the requested
 * page name and resolve it.
 *
 * @example
 *   // app/main.tsx
 *   createInertiaApp({
 *     resolve: (name) =>
 *       resolvePageComponent(
 *         `./pages/${name}.tsx`,
 *         import.meta.glob("./pages/**\/*.tsx"),
 *       ),
 *     ...
 *   });
 */
export type PageComponentModule = { default: unknown } | unknown;
export type GlobResult = Record<string, PageComponentModule | (() => Promise<PageComponentModule>)>;

export async function resolvePageComponent<T = PageComponentModule>(
    path: string | string[],
    pages: GlobResult
): Promise<T> {
    const candidates = Array.isArray(path) ? path : [path];

    for (const candidate of candidates) {
        // Vite's glob keys are relative paths (e.g. "./pages/Users/Index.tsx").
        // Matching by suffix means callers don't have to know the exact glob
        // root Vite normalized to — just the page name they're resolving.
        for (const [key, value] of Object.entries(pages)) {
            if (key === candidate || key.endsWith(candidate.replace(/^\.\//, "/"))) {
                const resolved = typeof value === "function" ? await (value as () => Promise<PageComponentModule>)() : value;
                return unwrapDefault(resolved) as T;
            }
        }
    }

    throw new Error(
        `[@nyalajs/inertia/client] Page component not found: "${candidates.join('" | "')}". ` +
        `Checked ${Object.keys(pages).length} glob entr${Object.keys(pages).length === 1 ? "y" : "ies"}.`
    );
}

function unwrapDefault(module: PageComponentModule): unknown {
    return module && typeof module === "object" && "default" in (module as any) ? (module as any).default : module;
}

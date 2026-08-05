/**
 * Browser-bundle entry point (import from "@nyalajs/inertia/client", not
 * "@nyalajs/inertia") — separate from the server-side entry because this
 * code runs in the Vite-built client bundle, not the Node server process.
 * @nyalajs/inertia's package.json "./client" export points at this file's
 * compiled output.
 */
export * from "./resolve-page-component";

// Thin re-export of @inertiajs/react's actual client so app code only ever
// imports from "@nyalajs/inertia/client" and never needs to know the
// underlying library's package name. @inertiajs/react is a peer dependency
// (see package.json) — apps must install it themselves alongside react/
// react-dom, same as any other peer dep.
export {
    createInertiaApp,
    Head,
    Link,
    WhenVisible,
    Deferred,
    useForm,
    usePage,
    usePoll,
    usePrefetch,
    useRemember,
    router,
} from "@inertiajs/react";

import "./app.css";
import { createRoot } from "react-dom/client";
import { createInertiaApp, resolvePageComponent } from "@nyalajs/inertia/client";

/**
 * Client entry — the file config/inertia.ts's `entry` points at, and what
 * html-shell.ts's <script type="module" src="..."> loads (dev: straight
 * from the Vite dev server; prod: the hashed build/ path from Vite's
 * manifest). createInertiaApp() reads the initial page from
 * div#app[data-page] (see @nyalajs/inertia/html-shell.ts's renderRootHtml())
 * and takes over client-side navigation from there.
 */
createInertiaApp({
    resolve: (name) =>
        resolvePageComponent(
            `./pages/${name}.tsx`,
            import.meta.glob("./pages/**/*.tsx")
        ),
    setup({ el, App, props }) {
        createRoot(el).render(<App {...props} />);
    },
});

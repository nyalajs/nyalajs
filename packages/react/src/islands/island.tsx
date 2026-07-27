import * as React from "react";
import { getIsland } from "./registry";
import { IslandTrackingContext } from "./context";

/**
 * Renders a registered island component as part of the normal server-render
 * pass (no separate render call — it's just another element in the tree),
 * wrapped in a marker `<div>` the client bootstrap script uses to find and
 * hydrate it. Use this instead of rendering the component directly:
 *
 *   {island("SearchBox", { initialQuery: "" })}
 *
 * `props` must be JSON-serializable — they're embedded in the HTML and read
 * back by the client bundle on hydration.
 */
export function island<P extends object>(name: string, props: P): React.ReactElement {
    const Component = getIsland(name);
    if (!Component) {
        throw new Error(
            `Unknown island "${name}" — did you forget to call registerIslands() at startup, ` +
            `or add it to app/islands/manifest.ts?`
        );
    }

    IslandTrackingContext.record(name);

    return (
        <div data-nyala-island={name} data-nyala-props={JSON.stringify(props)}>
            <Component {...props} />
        </div>
    );
}

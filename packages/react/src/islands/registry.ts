import * as React from "react";

const islands = new Map<string, React.ComponentType<any>>();

/**
 * Registers a component under a stable name so `island(name, props)` can
 * render it server-side and the client bootstrap can find its bundle
 * (served at `/public/islands/{name}.js`, produced by `buildIslands()`).
 * Usually called indirectly via `registerIslands()` at app startup, not
 * called directly.
 */
export function defineIsland<P>(name: string, component: React.ComponentType<P>): React.ComponentType<P> {
    if (islands.has(name)) {
        throw new Error(`Island "${name}" is already registered.`);
    }
    islands.set(name, component);
    return component;
}

export function getIsland(name: string): React.ComponentType<any> | undefined {
    return islands.get(name);
}

export function getIslandRegistry(): ReadonlyMap<string, React.ComponentType<any>> {
    return islands;
}

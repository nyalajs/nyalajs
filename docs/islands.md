# Islands

By default, [`view()`](./rendering.md) ships zero client JavaScript — pages
are static HTML. Islands are the opt-in escape hatch: mark a specific
component as interactive, and only that component gets a client bundle and
hydrates in the browser. The rest of the page stays plain HTML.

This is the "islands architecture" pattern — good default SEO/performance
(most of a page is static), real interactivity where you actually need it
(a live search box, a menu builder), without turning the whole site into a
single-page app.

## 1. Write the component

Nothing special about it — a normal React component. It'll run both on the
server (for the initial HTML) and in the browser (once hydrated), so avoid
browser-only globals at module scope.

```typescript
// app/islands/counter.tsx
import * as React from "react";

export default function Counter({ initial }: { initial: number }) {
  const [count, setCount] = React.useState(initial);
  return <button onClick={() => setCount((c) => c + 1)}>Count: {count}</button>;
}
```

## 2. List it in the manifest

`app/islands/manifest.ts` — one file, island name → path to its module. This
is the single source of truth both the runtime (rendering) and the build
step (bundling) read from:

```typescript
export const islands = {
  Counter: "./counter",
};
```

## 3. Register at startup

Before `app.listen()` (same lifecycle spot as `Model.setDatabase()`):

```typescript
import { registerIslands } from "@nyalajs/react";
import { islands } from "../app/islands/manifest";

await registerIslands(islands, path.join(__dirname, "../app/islands"), path.join(__dirname, "../public"));
```

The third argument (`staticDir`) must match whatever you pass as
`FastifyAdapterOptions.staticDir` — that's where `registerIslands()` looks
for the build output (`islands-manifest.json`, written by `nyala build`/
`nyala dev`, see below). If it's not there yet (no build has run), islands
still register fine for later use — but rendering a view that uses one will
throw a clear error telling you to build first, rather than silently
emitting a broken script tag.

## 4. Use it in a view

`island(name, props)` instead of rendering the component directly:

```typescript
import { island } from "@nyalajs/react";

function HomePage() {
  return (
    <div>
      <h1>Welcome</h1>
      {island("Counter", { initial: 0 })}
    </div>
  );
}
```

This renders the component's HTML inline as part of the normal server
render (no separate render pass, no cost if you don't use it) and wraps it
in a marker (`data-nyala-island`, `data-nyala-props`) the client-side
bootstrap script uses to find and hydrate it. `props` must be
JSON-serializable — they're embedded in the HTML and read back on hydration.

A `view()` that uses at least one island automatically gets one extra
`<script type="module">` tag for the hydration bootstrap. A view with no
islands is unaffected — still zero JS.

## 5. Build

```bash
nyala build   # one-shot, for production
nyala dev     # rebuilds automatically on island source changes
```

Both are no-ops — not even a warning — for apps that don't have
`app/islands/manifest.ts`. Output goes to `public/islands/*.js` plus
`public/islands-manifest.json` and a hashed bootstrap script
(`public/_nyala-islands-<hash>.js`), all served via the same `staticDir`
your app already configures.

**Cache-busting**: every filename is content-hashed. A redeploy with
changed component code always gets a new filename, so there's no
stale-bundle-in-a-browser-cache problem — the previous run's files are also
cleaned up (`nyala build`; `nyala dev`'s watch mode may leave a few stale
files behind between saves, which is fine for local dev).

## Errors

- **Client-side**: if a specific island's bundle fails to load or throws
  during hydration, that's logged to the browser console and skipped — it
  doesn't block other islands on the same page, and the server-rendered
  HTML underneath is already there regardless (hydration failing just means
  that one component stays non-interactive).
- **Server-side**: using an island in a view before ever running
  `nyala build`/`nyala dev` throws immediately, with a message telling you
  to build.

## What you don't get

No hydration means no client-side routing, no global client state shared
between islands, and no shared bundle across islands (each is its own
independent client entry point). For most sites this is the right
trade-off — see [Rendering](./rendering.md) for the reasoning. If a specific
part of your app genuinely wants to behave like a full SPA, that's a
different, bigger tool than what's built here.

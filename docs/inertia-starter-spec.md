# Inertia-Style Starter Kit — Design Spec

**Status: design only.** Nothing in this document exists yet. This is the
spec to review before any code gets written — see [Open Questions](#open-questions)
for the decisions still needed.

**Goal:** a starter (`nyala new my-app --template=inertia`) where the
backend owns routing and controllers return page components with props —
no separate REST/GraphQL API, no client-side router — the same model as
Laravel+Inertia or Rails+Inertia. The frontend is React, built with Vite.

## Assumptions (flag if wrong, everything below follows from these)

1. **One NyalaJS app**, not a backend + separate frontend repo — same
   shape as `templates/cms-starter`, not a client/server split.
2. **React only**, not Vue/Svelte — `@nyalajs/react` already exists;
   supporting other frameworks would mean parallel adapter packages, out
   of scope until someone actually needs one.
3. **Session-based auth**, reusing `cms-starter`'s `@fastify/secure-session`
   pattern, not JWT — see [§3](#3-auth-session-not-jwt) for why.
4. **Vite replaces esbuild for this starter only** — `cms-starter`'s
   islands keep using esbuild; this is a new, separate rendering path, not
   a framework-wide swap. See [§4](#4-why-vite-here-specifically).
5. Everything below only uses APIs verified against real source in this
   repo (citations inline) — no repeat of the doc-drift problem already
   fixed once in `website/docs/multi-tenancy/setup.md`.

---

## 1. What already exists that this builds on

Confirmed by reading source, not assumed:

- **`RenderableResponse`** (`packages/http/src/response/renderable.interface.ts`)
  — the duck-typed `{render(): string | Promise<string>, contentType?, statusCode?}`
  contract. `FastifyAdapter` checks `isRenderable(result)` on every
  controller return value (`packages/http/src/runtime/fastify-adapter.ts:423-435`)
  and calls `.render()` if present, with **no dependency on what produced
  it**. This is the seam an Inertia response plugs into — no core
  framework change needed.
- **`@nyalajs/react`'s `view()`** (`packages/react/src/view.ts`) already
  returns a `RenderableResponse` and does SSR via `renderToStaticMarkup`.
  It has a real, working "ship JS to hydrate a piece of the page"
  mechanism — islands (`packages/react/src/islands/`) — but it's
  **per-component, not whole-page**: each `island(name, props)` call gets
  its own esbuild entry point and its own `data-nyala-props` JSON
  attribute for hydration (`packages/react/src/islands/build.ts:32-51`).
  There is no "hydrate the entire page as one React tree with one props
  blob" path today. **This is the actual gap Inertia support has to
  fill** — not a missing renderer, a missing hydration model.
- **CSRF is real middleware, not just a config flag** —
  `@fastify/csrf-protection`, registered by `FastifyAdapter` when
  `options.csrf` is true (`packages/http/src/runtime/fastify-adapter.ts:233-247`),
  already paired with `@fastify/secure-session`. `saas-starter` already
  turns this on (`bootstrap/main.ts:24`). Inertia's client sends the CSRF
  token back automatically on every request once it's present as a
  cookie — no new CSRF mechanism needed, just confirming the existing one
  is enabled for this starter.
- **Header-driven response branching has one precedent**: the error
  handler picks an HTML error page vs. a JSON error body based on the
  `Accept` header (`packages/http/src/errors/exception-handler.ts:100-113`).
  This is the closest existing analog to what Inertia's protocol needs
  (branch on `X-Inertia` request header), but it's the only one — the
  actual `X-Inertia` handling described in [§2](#2-the-inertiaresponse-shape)
  is new.
- **CLI template registration** is a plain map + copy, not a plugin
  system: `TEMPLATE_FOLDERS` in `packages/cli/src/commands/new.command.ts:44-48`
  maps a `--template` flag value to a `templates/<dir>` to `fs.copy()`
  verbatim. Adding a 4th template is 3 small edits (map entry, inquirer
  prompt choice, `templates/inertia-starter/` directory) — no new CLI
  infrastructure required.

## 2. The `InertiaResponse` shape

New, in a new package (naming TBD — `@nyalajs/inertia` used below as a
placeholder):

```typescript
export interface InertiaPageObject {
    component: string;          // e.g. "Users/Index" — resolved client-side to a page component
    props: Record<string, unknown>;
    url: string;
    version: string | null;     // asset version, for the 409-reload-on-stale-build protocol
}

export class InertiaResponse implements RenderableResponse {
    constructor(
        private readonly page: InertiaPageObject,
        private readonly request: { headers: Record<string, string | undefined> }
    ) {}

    get contentType() {
        return this.isInertiaRequest() ? "application/json" : "text/html";
    }

    private isInertiaRequest(): boolean {
        return this.request.headers["x-inertia"] === "true";
    }

    async render(): Promise<string> {
        if (this.isInertiaRequest()) {
            return JSON.stringify(this.page);
        }
        // Full HTML on first load / hard navigation: a root div with the
        // page object serialized into a data attribute, plus a script tag
        // loading the Vite-built client entry. Mirrors how @inertiajs/*
        // server adapters render the initial page everywhere else.
        return renderRootHtml(this.page);
    }
}
```

A controller-facing helper mirrors `view()`'s existing ergonomics:

```typescript
@Get("/users")
index(@Req() req: FastifyRequest) {
    return inertia(req, "Users/Index", { users: this.usersService.findAll() });
}
```

**Open problem this doc does NOT resolve:** Inertia's real protocol also
needs (a) a 409 response with a `X-Inertia-Location` header when the
asset version changes, forcing a full reload instead of an XHR swap, and
(b) shared/"always" props merged into every response (flash messages,
current user). Both are real, both are more than a one-file addition —
scoped out of this doc's first draft; see [Open Questions](#open-questions).

## 3. Auth: session, not JWT

`templates/cms-starter/app/guards/session-auth.guard.ts` already states
the reasoning this starter would inherit verbatim: same-origin,
server-rendered, no separate API client, so `@fastify/secure-session`
avoids the token-storage/XSS surface JWT introduces for a browser-only
app. `basic-starter`/`saas-starter`'s JWT pattern exists because those are
API-first (or API-capable) — Inertia has no equivalent need for a bearer
token, since every request is same-origin and cookie-authenticated. This
starter reuses `cms-starter`'s session guard pattern, not the JWT one.

## 4. Why Vite here specifically

`cms-starter`'s islands use esbuild (`packages/react/src/islands/build.ts`,
via `packages/cli/runtime/island-builder.ts`) with no HMR — rebuild on
change, then `nyala dev`'s `tsc-watch` restarts the whole server
(`packages/cli/src/bin/nyala.ts:162-188`). That's fine for a handful of
small islands. It is **not** fine for an Inertia app, where the entire
frontend is the islands system's target — every page is a full React
component tree, and losing full-page state on every save would make
development miserable. Inertia's own client packages
(`@inertiajs/react` et al.) also assume Vite's dev-server/manifest
conventions; fighting that to force esbuild would be strictly worse for
no benefit.

This means `nyala dev` needs a second thing running for this starter
specifically: a Vite dev server (likely proxied through, or run
alongside, the existing `tsc-watch` process) instead of the
esbuild-watch path `build-islands.command.ts` runs today. **This is new
CLI behavior, not a reuse of the existing build-islands pipeline** — the
two starters' dev-mode stories diverge here, which is why this is scoped
as `--template=inertia`-only rather than a framework-wide "switch
everyone to Vite" change.

## Open Questions

Needs a decision before implementation starts:

1. **Package boundary** — new `@nyalajs/inertia` package, or does this
   live inside `@nyalajs/react` since it depends on it? Leaning new
   package (mirrors `@nyalajs/ai`'s "new capability = new package"
   principle), but `@nyalajs/react` is the only real consumer today.
2. **Vite + `nyala dev` integration** — proxy Fastify → Vite dev server,
   or have Vite output to a directory Fastify serves statically even in
   dev (slower iteration, simpler wiring)? This is the single biggest
   unresolved technical question — needs a spike, not just a decision.
3. **Shared/"always" props and the 409 stale-asset protocol** — both
   real parts of Inertia's actual protocol, deliberately left out of
   [§2](#2-the-inertiaresponse-shape)'s first-draft shape above.
4. **How much of `@inertiajs/react`'s client package do we depend on
   directly** vs. reimplement? Depending on it directly is almost
   certainly right (it's a small, stable client library) — flagging only
   because §2's `InertiaResponse` needs to produce exactly the JSON shape
   that client expects, which should be verified against the real
   package's source/types before implementation, not assumed from memory.

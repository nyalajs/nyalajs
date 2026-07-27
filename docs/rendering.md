# Rendering (`@nyalajs/react`)

NyalaJS controllers return plain data by default and `FastifyAdapter`
JSON-serializes it — that's unchanged. `@nyalajs/react` adds a second option:
return `view(Component, props)` instead, and the adapter sends real,
server-rendered HTML.

Rendering is server-side only (`react-dom/server`) — a view with no
[islands](./islands.md) ships zero client JavaScript. This isn't a
templating *language*; it's React used purely to produce HTML on the
server, once per request.

## Basic usage

```typescript
import { Controller, Get } from "@nyalajs/core";
import { view } from "@nyalajs/react";

function HomePage({ name }: { name: string }) {
  return <h1>Hello, {name}!</h1>;
}

@Controller("/")
export class HomeController {
  @Get("/")
  index() {
    return view(HomePage, { name: "World" }, { title: "Home" });
  }
}
```

`view(component, props, options?)` returns a `ViewResponse`. Nothing else
about the route changes — same `@Controller`/`@Get` decorators, same
guards/interceptors pipeline as a JSON route. `FastifyAdapter` detects the
response is renderable (it implements `@nyalajs/http`'s `RenderableResponse`
— any object with a `.render()` method, not React-specific) and sends the
HTML with the right content type instead of JSON-encoding it.

## `ViewOptions`

```typescript
interface ViewOptions {
  title?: string;
  meta?: Record<string, string>;   // <meta name="..." content="..."> tags
  statusCode?: number;              // defaults to 200
  layout?: React.ComponentType<LayoutProps>;
}
```

## Layouts

Without `options.layout`, views render inside `DefaultLayout` — a minimal
`<html><head>...</head><body>{children}</body></html>` shell using
`title`/`meta` from `ViewOptions`. Real apps almost always want their own
(nav, footer, `<link>` tags for CSS served via `staticDir` — see
[Static assets](#static-assets)):

```typescript
import { LayoutProps } from "@nyalajs/react";

function SiteLayout({ title, meta, children }: LayoutProps) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        {title && <title>{title}</title>}
        <link rel="stylesheet" href="/public/site.css" />
      </head>
      <body>
        <header>My Site</header>
        <main>{children}</main>
        <footer>© 2026</footer>
      </body>
    </html>
  );
}

// per-view:
view(HomePage, { name: "World" }, { layout: SiteLayout });
```

## Static assets

`FastifyAdapterOptions.staticDir` serves a directory (CSS, images, favicon)
via `@fastify/static` — not registered at all unless set:

```typescript
new FastifyAdapter(container, {
  staticDir: path.join(__dirname, "../public"),
  staticPrefix: "/public", // default
});
```

## Error pages

By default, an error thrown anywhere in the pipeline (a guard, a handler, a
view failing to render) goes through `@nyalajs/http`'s `ExceptionHandler`,
which sends JSON — correct for API clients. For a request that prefers HTML
(`Accept: text/html`, i.e. a browser navigating to the page), it sends a
small built-in HTML error page instead, so a broken page shows a page, not a
JSON blob. Nothing to configure for this default behavior.

For a branded error page, pass `errorView` to `FastifyAdapterOptions`:

```typescript
import { view } from "@nyalajs/react";

function ErrorPage({ statusCode, message }: { statusCode: number; message: string }) {
  return (
    <div>
      <h1>{statusCode}</h1>
      <p>{message}</p>
    </div>
  );
}

new FastifyAdapter(container, {
  errorView: (error, statusCode) => view(ErrorPage, { statusCode, message: error.message }),
});
```

`errorView` can return a `ViewResponse` (as above) or a plain HTML string.
It's only invoked for HTML-preferring requests — JSON API clients are
unaffected either way.

Stack traces are only included (JSON or HTML) when `NODE_ENV=development`
— not "anything other than exactly `production`", so a misconfigured or
unset `NODE_ENV` in a real deployment fails closed rather than leaking
stack traces.

## Next

- [Islands](./islands.md) — opt-in client-side interactivity, without giving
  up server rendering by default.

# CMS Starter Kit — Full Build Spec

**Status: implemented** at `templates/cms-starter/`, wired into
`nyala new --template=cms`. This document is now the design record, not a
to-do list — see the template's own `README.md` for day-to-day usage.

**New template:** `templates/cms-starter/` — a single NyalaJS app (no
separate frontend project) covering both an admin dashboard and the
public-facing visitor site.

**Rendering:** built on `@nyalajs/react` — controllers return
`view(Component, props, options)` instead of JSON, and `FastifyAdapter`
renders it server-side with `react-dom/server` and sends real HTML.
Server-rendered by default; two screens use real client-side
[islands](./islands.md) (added after this spec's first draft — see the
updated §6) rather than the simplified plain-HTML fallbacks originally
planned.

## Assumptions (flag if wrong, everything below follows from these)

1. **One NyalaJS app**, not a backend + a separate frontend repo — this
   supersedes the earlier draft of this spec, which assumed a Next.js
   frontend because NyalaJS had no rendering layer at the time.
2. Reuses what already ships: `Model` (decorator-based Active Record),
   `RolesGuard`/`@Roles`, `ValidateBody`/`ValidateQuery` (Zod),
   `StorageService` (local/S3 file storage), `@fastify/secure-session`
   (already wired into `FastifyAdapter`), the CLI's migration runner, and
   the new `@nyalajs/react` (`view()`) + `FastifyAdapterOptions.staticDir`.
3. **Single-tenant** (one website per deployment) — not built on
   `@nyalajs/tenancy`. If you actually want multi-site-per-install, say so;
   it changes several models (add `siteId`) and every admin screen.
4. Everything below only uses APIs that exist in the framework today
   (verified against source) — no repeat of the doc-drift problem this
   session already fixed once.

---

## 1. Repo layout

```
templates/cms-starter/
├── app/
│   ├── controllers/
│   │   ├── public/          # visitor-facing, return view(...)
│   │   └── admin/           # dashboard, return view(...) + form-post handlers
│   ├── views/                # React SSR components (no hydration)
│   │   ├── layout.tsx         # site chrome (header/footer from Menu+Setting)
│   │   ├── admin-layout.tsx   # dashboard chrome (sidebar/topbar)
│   │   ├── public/            # home, page, blog-index, blog-post, contact
│   │   └── admin/             # dashboard, pages-list, page-form, media, menus, users, forms, settings
│   ├── models/                # Page, Post, Category, Tag, Media, Menu, MenuItem, Setting, FormSubmission, User
│   ├── services/
│   ├── repositories/
│   ├── validators/            # Zod schemas
│   ├── guards/                # SessionAuthGuard (§3)
│   └── middleware/
├── database/
│   ├── migrations/
│   └── seeders/                # demo pages/posts/categories/admin user
├── public/                     # static assets, served via staticDir (CSS, images, favicon)
├── config/
├── bootstrap/
└── package.json
```

Everything here matches the existing `basic-starter` layout convention —
this is not a new project shape, just new content in `app/views/` and a
`public/` folder that wasn't needed before.

## 2. Data models (`app/models/*.model.ts`, plain Drizzle `pgTable` + `BaseRepository<T>`)

Not the decorator-based `Model` Active Record class from `@nyalajs/database`
— `mvc`/`saas`'s actual shipped templates use raw `pgTable()` schemas plus a
small per-template `BaseRepository<T>` (copied into every starter, not a
framework export), and this template matches that same, real convention.

| Model | Key fields |
|---|---|
| `User` | id, name, email, password (hashed), role (`admin`\|`editor`\|`viewer`), avatarUrl, createdAt, updatedAt |
| `Page` | id, title, slug (unique), blocks (json — array of `{type, data}` sections), metaTitle, metaDescription, ogImage, status (`draft`\|`published`), authorId, publishedAt, createdAt, updatedAt |
| `Post` | id, title, slug (unique), excerpt, content (rich text/HTML), coverImageUrl, categoryId, status, authorId, publishedAt, metaTitle, metaDescription, createdAt, updatedAt |
| `Category` | id, name, slug |
| `Tag` | id, name, slug |
| `PostTag` | postId, tagId (pivot) |
| `Media` | id, filename, url, mimeType, size, altText, uploadedById, createdAt |
| `Menu` | id, name, location (`header`\|`footer`) |
| `MenuItem` | id, menuId, label, url \| pageId, order, parentId |
| `Setting` | key (unique), value (json) — `siteName`, `siteDescription`, `logoUrl`, `faviconUrl`, `socialLinks`, `contactEmail`, `footerText`, `maintenanceMode` |
| `FormSubmission` | id, formName, data (json), ip, userAgent, read (bool), createdAt |

```typescript
import { pgTable, uuid, varchar, text, timestamp } from "drizzle-orm/pg-core";
import { InferSelectModel, InferInsertModel } from "drizzle-orm";

export const posts = pgTable("posts", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: varchar("title", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 255 }).notNull().unique(),
  excerpt: text("excerpt"),
  content: text("content").notNull(),
  coverImageUrl: varchar("cover_image_url", { length: 512 }),
  categoryId: uuid("category_id"),
  status: varchar("status", { length: 20 }).notNull().default("draft"),
  authorId: uuid("author_id").notNull(),
  publishedAt: timestamp("published_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type Post = InferSelectModel<typeof posts>;
export type NewPost = InferInsertModel<typeof posts>;
```

```typescript
// app/repositories/post.repository.ts
import { Injectable } from "@nyalajs/core";
import { BaseRepository } from "./base.repository";
import { posts, Post } from "../models/post.model";

@Injectable()
export class PostRepository extends BaseRepository<Post> {
  constructor() {
    super(posts);
  }
  // + findBySlug, listPublished, findByCategory, ...
}
```

Matching `database/migrations/*.ts` stubs (`up(db)/down(db)`, run via
`nyala db:migrate`) and seeders under `database/seeders/` for demo content
(an admin user, 2 categories, 5 posts, a home page, a header/footer menu) —
`nyala generate migration`/`nyala generate seeder` scaffold both, run via
`nyala db:seed`.

## 3. Auth: sessions, not JWT

One app, no cross-origin calls, so `@fastify/secure-session` (already built
into `FastifyAdapter`, just needs `SESSION_SECRET`/`SESSION_SALT` set) is
the natural fit — simpler than the JWT + cookie-proxy dance a separate
frontend would need.

```typescript
// app/controllers/admin/auth.controller.ts
@Controller("/admin")
export class AdminAuthController {
  constructor(private readonly authService: AuthService) {}

  @Get("/login")
  loginPage() {
    return view(LoginPage, {});
  }

  @Post("/login")
  @ValidateBody(LoginValidator)
  async login(@Body() dto: LoginDto, @Req() req: any, @Res() res: any) {
    const user = await this.authService.verify(dto.email, dto.password);
    if (!user) return view(LoginPage, { error: "Invalid credentials" });

    req.session.set("userId", user.id);
    req.session.set("role", user.role);
    res.redirect(302, "/admin");
  }

  @Post("/logout")
  async logout(@Req() req: any, @Res() res: any) {
    req.session.delete();
    res.redirect(302, "/admin/login");
  }
}
```

```typescript
// app/guards/session-auth.guard.ts
import { Guard, ExecutionContext } from "@nyalajs/http";

export class SessionAuthGuard implements Guard {
  canActivate(context: ExecutionContext): boolean {
    const userId = context.request.session?.get("userId");
    if (!userId) return false;
    context.context.userId = userId;
    return true;
  }
}
```

`@UseGuards(SessionAuthGuard)` on every `admin/*.controller.ts`
(`RolesGuard`/`@Roles("admin")` still applies the same way on top, reading
`context.request.session.get("role")`). If you later add a headless JSON
API for a mobile app, `AuthGuard`/`JwtStrategy` (`@nyalajs/security`) are
still there, unchanged, for that separate surface — the two auth strategies
don't need to interfere with each other.

## 4. Controllers → views

No new decorator — `view()` is just a return value, exactly like returning
a plain object for JSON:

```typescript
// app/controllers/public/blog.controller.ts
@Controller("/blog")
export class BlogController {
  constructor(private readonly postsService: PostsService) {}

  @Get("/")
  async index(@Query("page") page = 1, @Query("category") category?: string) {
    const { posts, meta } = await this.postsService.listPublished({ page, category });
    return view(BlogIndexPage, { posts, meta });
  }

  @Get("/:slug")
  async show(@Param("slug") slug: string) {
    const post = await this.postsService.findPublishedBySlug(slug);
    if (!post) return view(NotFoundPage, {}, { statusCode: 404 });
    return view(BlogPostPage, { post, related: await this.postsService.related(post) });
  }
}
```

Admin CRUD screens follow the same shape, but writes are plain HTML
`<form method="POST">` submissions (no hydration → no fetch/JSON from the
browser for these): `GET /admin/posts/:id/edit` returns `view(PostForm,
{post})`, `POST /admin/posts/:id` validates + saves + redirects back to the
list with `res.redirect(302, "/admin/posts")`.

## 5. Page/screen inventory

**Admin** (`SessionAuthGuard`, sidebar layout via `admin-layout.tsx`):
Dashboard home (stat cards: published pages/posts, unread submissions,
media count), Pages list/edit, Posts list/edit, Categories/Tags, Media
library, Menus, Users (admin role only), Forms inbox, Settings.

**Visitor site** (`layout.tsx`, header/footer driven by `Menu`/`Setting`
data — not hardcoded, so admin changes take effect without a redeploy):
Home (renders the `Page` with slug `home` via its `blocks` — each block
type maps to a view component, unknown types render nothing rather than
crashing the page), any CMS page (`/:slug`), blog index (`/blog`,
pagination + category/tag filter + search), post detail (`/blog/:slug` +
related posts), contact (`/contact`, form → `POST /forms/contact/submit`),
404. SEO: per-page `<title>`/meta description via `ViewOptions.title`/`meta`
(fallback to `Setting`'s site defaults), `sitemap.xml`/`robots.txt`/
`blog/rss.xml` as plain controllers returning XML/text (`contentType:
"application/xml"` — any object with a `.render()` method works, not just
`ViewResponse`, since `FastifyAdapter` only checks for that shape).

## 6. Client-side interactivity: two islands

Plain server-rendered forms handle the vast majority of a CMS admin fine —
every create/edit/delete screen is just a form + redirect, no JS required.
Two screens genuinely want live interactivity, and — now that
[islands](./islands.md) exist — get real ones instead of the simplified
fallbacks this section originally specified:

- **Menu builder** (`app/islands/menu-reorder.tsx`) — native HTML5
  drag-and-drop reordering, no external DnD library. Posts the new order to
  the menu-item reorder endpoint on drop.
- **Media upload** (`app/islands/media-uploader.tsx`) — multi-file,
  drag-and-drop, real per-file progress bars via `XMLHttpRequest` (`fetch`
  has no upload-progress event).

Everything else in the admin stays plain HTML forms — there's no reason to
reach for an island just because one is available. If another screen later
genuinely needs live interactivity, the same pattern applies: a small,
self-contained client bundle for just that one component, not a rewrite of
the rendering approach.

## 7. Static assets

`public/` (site CSS, admin CSS, favicon, images) served via:

```typescript
new FastifyAdapter(container, {
  staticDir: path.join(__dirname, "../public"),
  staticPrefix: "/public",
});
```

Uploaded media goes through `StorageService`, not this static dir — `Media`
rows store whatever URL `StorageService.disk().url(path)` resolves (a local
dev path or an S3/CDN URL in prod); views never construct storage URLs
themselves.

## 8. Security checklist (don't regress what this session just fixed)

- `SessionAuthGuard` (+ `RolesGuard`/`@Roles`) on every `admin/*` controller — no forgotten-guard exposure.
- `ValidateBody`/`ValidateQuery` on every write endpoint, including the public contact-form submit (rate-limited too — it's the one endpoint an anonymous visitor can hit).
- `SESSION_SECRET`/`SESSION_SALT` set in `.env` — required now that sessions are actually used for admin auth, not optional.
- No `corsOrigin` needed at all (no cross-origin frontend) — leave CORS at its closed default unless you add a separate headless API consumer later.
- Never return `password` from any `User` query — strip it in the service layer before returning to a view.
- Admin form-post handlers must re-check `SessionAuthGuard` server-side per request — there's no client-side route guarding to (falsely) rely on.

## 9. Suggested build order

1. Models + migrations + seeders → confirm `nyala db:migrate && nyala db:seed` works standalone.
2. `app/views/layout.tsx` + `admin-layout.tsx` + a `public/site.css` — get the shell rendering before wiring any real data.
3. Session auth: `SessionAuthGuard`, login/logout controller + `LoginPage` view.
4. Admin CRUD, one resource at a time (Category/Tag first, then Page, then Post, then Media upload, then Menu, then Settings, then Forms) — list view → form view → POST handler, per resource.
5. Public site: home/page block-renderer, blog index/detail, contact form, sitemap/robots/RSS.
6. Wire into the CLI: `templates/cms-starter/` + `TEMPLATE_FOLDERS.cms = "cms-starter"` in `new.command.ts`, add `"cms"` to the `nyala new` template choices.
7. `templates/cms-starter/README.md` (setup steps) + a short `docs/` page matching `quick-start.md`'s style.

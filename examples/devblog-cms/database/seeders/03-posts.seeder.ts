import { eq } from "drizzle-orm";
import { db } from "../connection";
import { posts } from "../../app/models/post.model";
import { users } from "../../app/models/user.model";
import { categories } from "../../app/models/category.model";
import { tags } from "../../app/models/tag.model";
import { postTags } from "../../app/models/post-tag.model";

/**
 * Seeds the tag taxonomy plus 8 real, technically-accurate blog posts about
 * building applications with Nyala JS. Each post is assigned a category and
 * 1-3 tags via the post_tags pivot. Dates are staggered so the blog index
 * (which sorts by publishedAt) reads like a real publishing history; one
 * post is left as "draft" to demonstrate that status filtering works on the
 * public site.
 */
export async function run() {
    console.log("Seeding tags...");

    const tagRows = [
        { name: "TypeScript", slug: "typescript" },
        { name: "Dependency Injection", slug: "dependency-injection" },
        { name: "Multi-Tenancy", slug: "multi-tenancy" },
        { name: "ORM", slug: "orm" },
        { name: "Testing", slug: "testing" },
        { name: "CLI", slug: "cli" },
        { name: "Modules", slug: "modules" },
        { name: "Security", slug: "security" },
    ];

    for (const row of tagRows) {
        await db.insert(tags).values(row).onConflictDoNothing();
    }
    console.log(`✓ Seeded ${tagRows.length} tags`);

    console.log("Seeding posts...");

    const [admin] = await db.select().from(users).where(eq(users.email, "admin@example.com")).limit(1);
    if (!admin) {
        console.log("  skipped: admin user not found (run the admin-user seeder first)");
        return;
    }

    const allCategories = await db.select().from(categories);
    const categoryBySlug = (slug: string) => allCategories.find((c) => c.slug === slug)?.id;

    const allTags = await db.select().from(tags);
    const tagBySlug = (slug: string) => allTags.find((t) => t.slug === slug)?.id;

    // Staggered publish dates, most recent first in the array but ascending
    // in time so the blog index (sorted desc by publishedAt) reads oldest
    // to newest as you scroll back through the archive.
    const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);

    const rows: {
        title: string;
        slug: string;
        excerpt: string;
        content: string;
        status: string;
        authorId: string;
        categoryId?: string;
        publishedAt?: Date;
        tagSlugs: string[];
    }[] = [
        {
            title: "Getting started with dependency injection in Nyala",
            slug: "getting-started-with-dependency-injection-in-nyala",
            excerpt:
                "Nyala's DI container resolves your controllers, services, and repositories by constructor parameter types, using reflect-metadata under the hood. Here's how @Injectable, @Module, and constructor injection fit together.",
            content: `<p>Every Nyala app is built out of classes wired together by a dependency injection (DI) container, the same pattern you'd recognize from Angular or NestJS. Mark a class <code>@Injectable()</code>, list its dependencies as constructor parameters, and the container resolves the graph for you — no manual <code>new SomeService(new SomeRepo())</code> wiring anywhere in application code.</p>

<pre><code>import { Injectable } from "@nyalajs/core";

@Injectable()
export class PostsService {
  constructor(private postRepo: PostRepository) {}

  findPublished() {
    return this.postRepo.findPublished();
  }
}</code></pre>

<p>This works because Nyala imports <code>reflect-metadata</code> at the application entrypoint and every injectable class is compiled with TypeScript's <code>emitDecoratorMetadata</code> turned on. At runtime the container reads the constructor's parameter types off that metadata and resolves each one recursively, instantiating the whole dependency graph lazily the first time something asks for it.</p>

<p>Controllers get the same treatment. A controller class decorated with <code>@Controller()</code> declares its route handlers with <code>@Get()</code>, <code>@Post()</code>, and friends, and any services or repositories it needs are just constructor parameters:</p>

<pre><code>import { Controller, Get } from "@nyalajs/core";

@Controller("/posts")
export class PostsController {
  constructor(private postsService: PostsService) {}

  @Get("/")
  async index() {
    return this.postsService.findPublished();
  }
}</code></pre>

<p>Everything gets tied together by a <code>@Module()</code> — the decorator that declares which controllers and providers belong to a feature area, and which other modules it imports. <code>NyalaFactory.create(AppModule)</code> walks that module graph at boot, registers every provider with the container, and resolves routes once the graph is fully built. If you've used NestJS this will feel immediately familiar — that's deliberate, we borrowed the parts of that design that hold up well in production.</p>

<p>This CMS you're reading right now is built exactly this way: <code>PostRepository</code>, <code>CategoryRepository</code>, and the rest all get injected into their respective admin controllers, with zero manual instantiation anywhere in <code>app/</code>.</p>`,
            status: "published",
            authorId: admin.id,
            categoryId: categoryBySlug("tutorials"),
            publishedAt: daysAgo(42),
            tagSlugs: ["typescript", "dependency-injection", "modules"],
        },
        {
            title: "Building a multi-tenant SaaS with @nyalajs/tenancy",
            slug: "building-a-multi-tenant-saas-with-nyalajs-tenancy",
            excerpt:
                "@nyalajs/tenancy gives every tenant-scoped table fail-closed data isolation: if a query runs without an active tenant context, it throws instead of silently returning cross-tenant rows.",
            content: `<p>Multi-tenancy is one of those features that's easy to get subtly wrong — miss a single <code>WHERE tenant_id = ?</code> clause in one query path and you've leaked one customer's data into another's response. <code>@nyalajs/tenancy</code> exists to make that class of bug structurally hard to write.</p>

<p>The core idea is a request-scoped <code>TenantContext</code> that gets populated early in the request lifecycle — by a <code>TenantMiddleware</code> that resolves the current tenant from a subdomain, a header, or a claim in a JWT, depending on which <code>TenantResolver</code> you configure (the package ships <code>SubdomainResolver</code>, <code>HeaderResolver</code>, and <code>JwtResolver</code> out of the box).</p>

<pre><code>import { TenantMiddleware, SubdomainResolver } from "@nyalajs/tenancy";

app.use(new TenantMiddleware(new SubdomainResolver()));</code></pre>

<p>Once the context is set, every table with a <code>tenant_id</code> column gets scoped automatically by the underlying <code>Model</code> class from <code>@nyalajs/database</code> — not opt-in, mandatory. If a query runs against a tenant-scoped table with no active tenant context, the framework throws rather than returning unscoped rows:</p>

<pre><code>Tenant context required: Invoice's table has a tenant_id column
but no tenant is active for the current request/transaction.</code></pre>

<p>That fail-closed behavior is deliberate. A repository built on top of <code>TenantRepository&lt;T&gt;</code> inherits this for free — its <code>find()</code>, <code>findOne()</code>, <code>create()</code>, <code>update()</code>, and <code>delete()</code> methods all delegate to the Model's static methods, so there's no per-repository filtering logic left for a subclass to forget:</p>

<pre><code>@Injectable()
class InvoiceRepository extends TenantRepository&lt;Invoice&gt; {
  protected readonly model = Invoice;
}</code></pre>

<p>The <code>saas-starter</code> template wires all of this up already — tenant resolution, guarded routes, and a tenant-scoped example model — if you want to see the full request lifecycle rather than just the pieces. This CMS you're reading isn't multi-tenant (it's a single-site starter), but the same package is what backs Nyala's SaaS template.</p>`,
            status: "published",
            authorId: admin.id,
            categoryId: categoryBySlug("architecture"),
            publishedAt: daysAgo(35),
            tagSlugs: ["multi-tenancy", "security", "typescript"],
        },
        {
            title: "Why we chose Drizzle for @nyalajs/database",
            slug: "why-we-chose-drizzle-for-nyalajs-database",
            excerpt:
                "@nyalajs/database wraps Drizzle ORM with an optional Active-Record-style Model class, while still letting you drop to plain pgTable schemas and raw Drizzle queries when that's a better fit.",
            content: `<p>Nyala's data layer is built on <a href="https://orm.drizzle.team">Drizzle ORM</a> rather than a full-blown decorator-heavy ORM like TypeORM, and it's worth explaining why, because the framework actually supports two different styles on top of it.</p>

<p>The first style — used by this CMS starter and the <code>basic</code>/<code>saas</code> templates — is plain Drizzle: define a table with <code>pgTable()</code>, infer <code>Select</code>/<code>Insert</code> types with <code>InferSelectModel</code>/<code>InferInsertModel</code>, and query it directly through a small <code>BaseRepository&lt;T&gt;</code> wrapper. No magic, no decorators on the schema itself — what you see in <code>app/models/post.model.ts</code> is the actual runtime shape:</p>

<pre><code>export const posts = pgTable("posts", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: varchar("title", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 255 }).notNull().unique(),
  status: varchar("status", { length: 20 }).notNull().default("draft"),
  // ...
});</code></pre>

<p>The second style is <code>@nyalajs/database</code>'s <code>Model</code> base class — an Active Record layer for teams that want <code>Invoice.find(id)</code> / <code>await invoice.save()</code> ergonomics instead of manually calling into a repository. It's still Drizzle underneath: <code>Model.all()</code>, <code>.find()</code>, <code>.create()</code>, <code>.save()</code>, and <code>.delete()</code> all resolve a table from a <code>SchemaRegistry</code> and run ordinary Drizzle queries against it, including the fail-closed tenant scoping described in <code>TenantRepository</code>.</p>

<p>The reason we didn't build (or adopt) a heavier ORM: Drizzle's query builder compiles to SQL you can actually read, its types come directly from your schema definition rather than a separate decorator/reflection pass, and it has no runtime dependency on experimental TypeScript features beyond what the rest of Nyala already needs for DI. You get real type safety on every query without a code-generation step blocking your dev loop.</p>

<p>Migrations follow the same philosophy — <code>database/migrations/</code> in every template is just ordered <code>up()</code>/<code>down()</code> functions run by <code>nyala db:migrate</code>, not a black-box schema-diffing tool guessing at your intent.</p>`,
            status: "published",
            authorId: admin.id,
            categoryId: categoryBySlug("architecture"),
            publishedAt: daysAgo(28),
            tagSlugs: ["orm", "typescript"],
        },
        {
            title: "A tour of the nyala CLI generators",
            slug: "a-tour-of-the-nyala-cli-generators",
            excerpt:
                "nyala generate scaffolds controllers, services, repositories, models, migrations, jobs, events, and more — each one dropped into the app/ convention nyala new already set up.",
            content: `<p><code>@nyalajs/cli</code> is more than <code>nyala new</code>. Once you have a project scaffolded, <code>nyala generate</code> (aliased <code>nyala g</code>) saves you from hand-writing the boilerplate for every new artifact type as your app grows:</p>

<pre><code>nyala generate controller Posts       # app/controllers/posts.controller.ts
nyala generate service Posts          # app/providers/posts.service.ts
nyala generate repository Posts       # app/repositories/posts.repository.ts
nyala generate model Post             # app/models/post.model.ts
nyala generate migration create_posts_table
nyala generate request CreatePost
nyala generate policy Post
nyala generate middleware RateLimit
nyala generate event PostPublished
nyala generate listener SendPostNotification
nyala generate job GenerateSitemap
nyala generate resource Post
nyala generate plugin Analytics
nyala generate seeder Post
nyala generate factory Post</code></pre>

<p>Names can be passed with or without the conventional suffix — <code>nyala generate policy User</code> and <code>nyala generate policy UserPolicy</code> both produce <code>app/policies/user.policy.ts</code> exporting a class named <code>UserPolicy</code>. Every generator writes into the exact folder convention <code>nyala new</code> already scaffolded, so a freshly generated controller sits right next to the hand-written ones.</p>

<p>Not every generator emits fully wired code today — some (model, migration, repository, request, event, listener, job, plugin) depend on framework subsystems that are still evolving, so those templates are clearly marked stubs rather than pretending to be complete. The CLI surface exists so the shape of your app stays consistent even before every generator is feature-complete.</p>

<p>The CLI also owns your database workflow end to end: <code>nyala db:migrate</code>, <code>nyala db:rollback</code>, <code>nyala db:fresh</code> (drop + re-run everything), and <code>nyala db:seed</code> — the exact commands this demo's own <code>package.json</code> scripts wrap as <code>npm run db:migrate</code> / <code>npm run db:seed</code>.</p>`,
            status: "published",
            authorId: admin.id,
            categoryId: categoryBySlug("tutorials"),
            publishedAt: daysAgo(21),
            tagSlugs: ["cli", "typescript"],
        },
        {
            title: "Testing Nyala applications with Vitest",
            slug: "testing-nyala-applications-with-vitest",
            excerpt:
                "This CMS's own test suite is a good reference: it renders real view components with view(), exercises guards and controllers against fakes, and bundles islands with esbuild — all through Vitest, no live database required.",
            content: `<p>None of the official Nyala templates ship a database-backed integration test by default — and that's on purpose. The fastest, most reliable tests are the ones that don't need Postgres running at all. This CMS starter's own <code>tests/smoke.spec.tsx</code> demonstrates the pattern we recommend.</p>

<p>Guards are plain classes with a <code>canActivate(context)</code> method, so they're trivial to unit test directly, no HTTP server involved:</p>

<pre><code>import { describe, it, expect } from "vitest";
import { SessionAuthGuard } from "../app/guards/session-auth.guard";

it("denies a request with no session userId", () =&gt; {
  const guard = new SessionAuthGuard();
  expect(guard.canActivate(ctxWithSession({}))).toBe(false);
});</code></pre>

<p>Controllers take their dependencies through the constructor (that's the DI pattern again), which means a test can hand them a fake in-memory repository instead of a real database connection and exercise a full CRUD round trip in memory:</p>

<pre><code>const repo = fakeCategoryRepository();
const controller = new CategoriesController(repo as any);

await controller.create({ name: "News", slug: "news" } as any, fakeReply());
expect(repo.rows).toHaveLength(1);</code></pre>

<p>View components render server-side through <code>@nyalajs/react</code>'s <code>view()</code> helper, so you can assert on the actual rendered HTML string without spinning up a browser:</p>

<pre><code>const html = view(SiteLayout, { siteName: "My Site", children: &lt;p&gt;Hello&lt;/p&gt; }).render();
expect(html).toContain("Hello");</code></pre>

<p>The one piece that's slightly more involved is testing islands (this starter's <code>MediaUploader</code> and <code>MenuReorder</code> components) — since they're bundled separately by esbuild for client hydration, the test suite calls <code>buildIslands()</code> against a temp directory first, then asserts the manifest and rendered hydration markers are correct. Every test in this project runs via plain <code>vitest run</code>, wired up as <code>npm test</code>, with zero external services required.</p>`,
            status: "published",
            authorId: admin.id,
            categoryId: categoryBySlug("tutorials"),
            publishedAt: daysAgo(14),
            tagSlugs: ["testing", "typescript"],
        },
        {
            title: "Modules and the application graph: how Nyala wires everything together",
            slug: "modules-and-the-application-graph",
            excerpt:
                "@Module() declares controllers, providers, and imports; NyalaFactory.create() walks that graph at boot, resolves every route through the DI container, and only then starts listening.",
            content: `<p>If dependency injection is how two classes find each other, the <code>@Module()</code> decorator is how you organize which classes exist in the first place. A module declares three things: the controllers it owns, the providers (services, repositories) it makes available, and the other modules it imports.</p>

<pre><code>@Module({
  imports: [DatabaseModule],
  controllers: [PostsController, CategoriesController],
  providers: [PostsService, PostRepository, CategoryRepository],
})
export class BlogModule {}</code></pre>

<p>Boot in a Nyala app always starts the same way, and this CMS's own <code>bootstrap/main.ts</code> is a real example of it:</p>

<pre><code>const app = await NyalaFactory.create(AppModule);
app.setHttpAdapter(new FastifyAdapter());
await app.listen(3000);</code></pre>

<p><code>NyalaFactory.create()</code> installs process-level crash handlers, constructs a <code>Kernel</code>, and calls <code>kernel.bootstrap(rootModule)</code> — which walks the entire module import graph starting from <code>AppModule</code>, registering every provider it finds with the DI container along the way. Only after that graph is fully resolved does <code>app.listen()</code> call <code>bindRoutes()</code>, which uses a <code>RouteResolver</code> to turn every <code>@Controller()</code>/<code>@Get()</code>/<code>@Post()</code>-decorated method into an actual route bound to the HTTP adapter.</p>

<p>This ordering matters: nothing can be resolved out of order, because routes aren't bound until the whole module graph — and therefore the whole DI container — is already populated. It's also why plugins boot where they do: <code>app.plugin(...)</code> registers plugin instances, but <code>bootPlugins()</code> only actually runs them right before <code>listen()</code>, once every module in your app is guaranteed to be ready.</p>

<p>For a CMS like this one, that translates to a handful of small, focused modules — pages, posts, media, menus, auth — each with its own controllers and providers, all composed together in <code>bootstrap/app.module.ts</code>.</p>`,
            status: "published",
            authorId: admin.id,
            categoryId: categoryBySlug("architecture"),
            publishedAt: daysAgo(7),
            tagSlugs: ["modules", "dependency-injection"],
        },
        {
            title: "Nyala 2.0: session auth, request validation, and a real CMS starter",
            slug: "nyala-2-0-session-auth-request-validation-cms-starter",
            excerpt:
                "A look at what shipped in the 2.0 line: @nyalajs/security's session-based guards, @nyalajs/validation's Zod integration, and the cms-starter template this very blog runs on.",
            content: `<p>The 2.0 release line brought together a few pieces that, until recently, you had to hand-roll in every Nyala app: session-based authentication, request validation, and — the reason you're reading this on an actual working site instead of a stub page — a full CMS starter template.</p>

<p><code>@nyalajs/security</code> provides the guard primitives this admin dashboard runs on. A <code>SessionAuthGuard</code> checks for a <code>userId</code> in the request session and populates guard metadata that a follow-on <code>RolesGuard</code> can read, so role checks compose cleanly with authentication checks rather than duplicating logic:</p>

<pre><code>@Controller("/admin/posts")
@UseGuards(SessionAuthGuard, RolesGuard(["admin", "editor"]))
export class PostsController { /* ... */ }</code></pre>

<p><code>@nyalajs/validation</code> wraps Zod so request bodies get validated (and typed) before they ever reach a controller method — this CMS's <code>app/validators/</code> directory is full of small Zod schemas doing exactly that for post, page, category, and contact-form submissions.</p>

<p>And then there's this template itself. <code>cms-starter</code> is deliberately a full application, not a scaffold you have to fill in: an admin dashboard for pages, posts, categories, tags, media, menus, users, and site settings, plus a server-rendered public site with blog pagination, RSS, sitemap.xml, and a contact form — all in one app, no separate frontend project. Two screens (media upload, menu reordering) use client-side "islands" for interactivity; everything else is plain server-rendered HTML.</p>

<p>This blog you're reading is that exact template, with its placeholder seed data swapped out for real posts about the framework it's running on.</p>`,
            status: "published",
            authorId: admin.id,
            categoryId: categoryBySlug("release-notes"),
            publishedAt: daysAgo(3),
            tagSlugs: ["security", "typescript"],
        },
        {
            title: "Draft: benchmarking Postgres connection pooling under load",
            slug: "draft-benchmarking-postgres-connection-pooling-under-load",
            excerpt:
                "Work in progress — early numbers on tuning the postgres.js pool size used by @nyalajs/database's connection layer under concurrent request load. Not ready for publication yet.",
            content: `<p>This is a work-in-progress post. Early notes so far:</p>

<p>The database connection in every Nyala template (see <code>database/connection.ts</code> here) goes through <code>postgres.js</code> wrapped by <code>drizzle()</code>, with a configurable pool — this starter defaults to <code>max: 10</code>, <code>idle_timeout: 20</code>, <code>connect_timeout: 10</code>. I want to run this CMS's admin endpoints under a concurrent load test at a few different pool sizes (5, 10, 25, 50) and see where response times start to fall over versus where they're just bottlenecked on Postgres itself.</p>

<p>TODO before publishing: actually run the benchmark, not just describe the plan. Get real numbers from a k6 or autocannon run against a seeded database, not guesses.</p>`,
            status: "draft",
            authorId: admin.id,
            categoryId: categoryBySlug("case-studies"),
            tagSlugs: ["orm", "testing"],
        },
    ];

    for (const row of rows) {
        const { tagSlugs, ...postData } = row;
        await db.insert(posts).values(postData).onConflictDoNothing();

        const [savedPost] = await db.select().from(posts).where(eq(posts.slug, row.slug)).limit(1);
        if (!savedPost) continue;

        for (const tagSlug of tagSlugs) {
            const tagId = tagBySlug(tagSlug);
            if (!tagId) continue;
            await db.insert(postTags).values({ postId: savedPost.id, tagId }).onConflictDoNothing();
        }
    }

    console.log(`✓ Seeded ${rows.length} posts (7 published, 1 draft) with tag associations`);
}

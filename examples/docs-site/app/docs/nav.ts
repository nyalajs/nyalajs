/**
 * The docs nav structure — which real website/docs/*.md files exist, in
 * what order, under what group headings. Mirrors website/docs/.vitepress/
 * config.ts's `sidebar` array (the actual source of truth for the real
 * VitePress site) rather than reinventing a different structure; kept as
 * plain data here (not imported directly from that file) because
 * config.ts is a TypeScript module built for Vite's own config loader, not
 * a portable data export.
 *
 * `slug` is the file's path under DOCS_SOURCE_DIR, without the .md
 * extension — DocsService resolves `${slug}.md` to render it, and the
 * frontend routes on this same slug via /docs/:slug*.
 */
export interface NavItem {
    title: string;
    slug: string;
}

export interface NavGroup {
    title: string;
    items: NavItem[];
}

export const docsNav: NavGroup[] = [
    {
        title: "Getting Started",
        items: [
            { title: "Introduction", slug: "introduction" },
            { title: "Installation", slug: "installation" },
            { title: "Quick Start", slug: "quick-start" },
            { title: "Configuration", slug: "configuration" },
        ],
    },
    {
        title: "Core Concepts",
        items: [
            { title: "Architecture Overview", slug: "concepts/architecture" },
            { title: "Project Structure", slug: "concepts/structure" },
            { title: "Dependency Injection", slug: "concepts/dependency-injection" },
            { title: "Lifecycle Hooks", slug: "concepts/lifecycle" },
        ],
    },
    {
        title: "Building Blocks",
        items: [
            { title: "Controllers", slug: "building-blocks/controllers" },
            { title: "Services", slug: "building-blocks/services" },
            { title: "Repositories", slug: "building-blocks/repositories" },
            { title: "Models", slug: "building-blocks/models" },
            { title: "DTOs", slug: "building-blocks/dtos" },
            { title: "Validators", slug: "building-blocks/validators" },
            { title: "Middleware", slug: "building-blocks/middleware" },
        ],
    },
    {
        title: "Features",
        items: [
            { title: "Authentication", slug: "features/authentication" },
            { title: "Authorization", slug: "features/authorization" },
            { title: "Permissions", slug: "features/permissions" },
            { title: "Validation", slug: "features/validation" },
            { title: "Error Handling", slug: "features/error-handling" },
            { title: "Logging", slug: "features/logging" },
            { title: "Caching", slug: "features/caching" },
            { title: "AI Assistant", slug: "features/ai" },
            { title: "WebSockets", slug: "features/websockets" },
            { title: "Streaming", slug: "features/streaming" },
            { title: "Storage", slug: "features/storage" },
            { title: "Microservices", slug: "features/microservices" },
            { title: "Queues", slug: "features/queues" },
            { title: "GraphQL", slug: "features/graphql" },
        ],
    },
    {
        title: "Multi-Tenancy",
        items: [
            { title: "Overview", slug: "multi-tenancy/overview" },
            { title: "Setup", slug: "multi-tenancy/setup" },
            { title: "Tenant Resolution", slug: "multi-tenancy/resolution" },
            { title: "Data Isolation", slug: "multi-tenancy/isolation" },
            { title: "Best Practices", slug: "multi-tenancy/best-practices" },
        ],
    },
    {
        title: "CLI",
        items: [
            { title: "Overview", slug: "cli/overview" },
            { title: "Commands", slug: "cli/commands" },
            { title: "Generators", slug: "cli/generators" },
            { title: "Templates", slug: "cli/templates" },
        ],
    },
    {
        title: "Testing",
        items: [
            { title: "Getting Started", slug: "testing/overview" },
            { title: "Unit Tests", slug: "testing/unit" },
            { title: "Integration Tests", slug: "testing/integration" },
            { title: "E2E Tests", slug: "testing/e2e" },
            { title: "Mocking", slug: "testing/mocking" },
        ],
    },
    {
        title: "Deployment",
        items: [
            { title: "Production Checklist", slug: "deployment/checklist" },
            { title: "Docker", slug: "deployment/docker" },
            { title: "Kubernetes", slug: "deployment/kubernetes" },
            { title: "Environment Variables", slug: "deployment/environment" },
            { title: "Monitoring", slug: "deployment/monitoring" },
        ],
    },
    {
        title: "API Reference",
        items: [
            { title: "Overview", slug: "api/overview" },
            { title: "Decorators", slug: "api/decorators" },
            { title: "Core Services", slug: "api/core-services" },
            { title: "HTTP", slug: "api/http" },
            { title: "Security", slug: "api/security" },
            { title: "Tenancy", slug: "api/tenancy" },
        ],
    },
    {
        title: "Examples",
        items: [{ title: "Overview", slug: "examples" }],
    },
    {
        title: "Resources",
        items: [
            { title: "FAQ", slug: "resources/faq" },
            { title: "Troubleshooting", slug: "resources/troubleshooting" },
            { title: "Migration Guide", slug: "resources/migration" },
            { title: "Contributing", slug: "resources/contributing" },
        ],
    },
];

/** Flat list of every real slug in nav order — used for prev/next and search indexing. */
export const flatNavItems: (NavItem & { group: string })[] = docsNav.flatMap((group) =>
    group.items.map((item) => ({ ...item, group: group.title }))
);

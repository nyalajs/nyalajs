import { defineConfig } from 'vitepress'

export default defineConfig({
    title: 'Nyala',
    description: 'Enterprise TypeScript Framework for Production Applications',

    themeConfig: {
        logo: '/logo.svg',

        nav: [
            { text: 'Docs', link: '/introduction' },
            { text: 'Guide', link: '/getting-started' },
            { text: 'API', link: '/api/overview' },
            { text: 'Examples', link: '/examples' },
        ],

        sidebar: [
            {
                text: 'Getting Started',
                items: [
                    { text: 'Introduction', link: '/introduction' },
                    { text: 'Installation', link: '/installation' },
                    { text: 'Quick Start', link: '/quick-start' },
                    { text: 'Configuration', link: '/configuration' },
                ]
            },
            {
                text: 'Core Concepts',
                items: [
                    { text: 'Architecture Overview', link: '/concepts/architecture' },
                    { text: 'Project Structure', link: '/concepts/structure' },
                    { text: 'Dependency Injection', link: '/concepts/dependency-injection' },
                    { text: 'Lifecycle Hooks', link: '/concepts/lifecycle' },
                ]
            },
            {
                text: 'Building Blocks',
                items: [
                    { text: 'Controllers', link: '/building-blocks/controllers' },
                    { text: 'Services', link: '/building-blocks/services' },
                    { text: 'Repositories', link: '/building-blocks/repositories' },
                    { text: 'Models', link: '/building-blocks/models' },
                    { text: 'DTOs', link: '/building-blocks/dtos' },
                    { text: 'Validators', link: '/building-blocks/validators' },
                    { text: 'Middleware', link: '/building-blocks/middleware' },
                ]
            },
            {
                text: 'Features',
                items: [
                    { text: 'Authentication', link: '/features/authentication' },
                    { text: 'Authorization', link: '/features/authorization' },
                    { text: 'Validation', link: '/features/validation' },
                    { text: 'Error Handling', link: '/features/error-handling' },
                    { text: 'Logging', link: '/features/logging' },
                    { text: 'Caching', link: '/features/caching' },
                ]
            },
            {
                text: 'Multi-Tenancy',
                items: [
                    { text: 'Overview', link: '/multi-tenancy/overview' },
                    { text: 'Setup', link: '/multi-tenancy/setup' },
                    { text: 'Tenant Resolution', link: '/multi-tenancy/resolution' },
                    { text: 'Data Isolation', link: '/multi-tenancy/isolation' },
                    { text: 'Best Practices', link: '/multi-tenancy/best-practices' },
                ]
            },
            {
                text: 'CLI',
                items: [
                    { text: 'Overview', link: '/cli/overview' },
                    { text: 'Commands', link: '/cli/commands' },
                    { text: 'Generators', link: '/cli/generators' },
                    { text: 'Templates', link: '/cli/templates' },
                ]
            },
            {
                text: 'Testing',
                items: [
                    { text: 'Getting Started', link: '/testing/overview' },
                    { text: 'Unit Tests', link: '/testing/unit' },
                    { text: 'Integration Tests', link: '/testing/integration' },
                    { text: 'E2E Tests', link: '/testing/e2e' },
                    { text: 'Mocking', link: '/testing/mocking' },
                ]
            },
            {
                text: 'Deployment',
                items: [
                    { text: 'Production Checklist', link: '/deployment/checklist' },
                    { text: 'Docker', link: '/deployment/docker' },
                    { text: 'Kubernetes', link: '/deployment/kubernetes' },
                    { text: 'Environment Variables', link: '/deployment/environment' },
                    { text: 'Monitoring', link: '/deployment/monitoring' },
                ]
            },
            {
                text: 'API Reference',
                items: [
                    { text: 'Overview', link: '/api/overview' },
                    { text: 'Decorators', link: '/api/decorators' },
                    { text: 'Core Services', link: '/api/core-services' },
                    { text: 'HTTP', link: '/api/http' },
                    { text: 'Security', link: '/api/security' },
                    { text: 'Tenancy', link: '/api/tenancy' },
                ]
            },
            {
                text: 'Examples',
                items: [
                    { text: 'Blog API', link: '/examples/blog-api' },
                    { text: 'E-commerce', link: '/examples/ecommerce' },
                    { text: 'SaaS Application', link: '/examples/saas' },
                    { text: 'Microservices', link: '/examples/microservices' },
                ]
            },
            {
                text: 'Resources',
                items: [
                    { text: 'FAQ', link: '/resources/faq' },
                    { text: 'Troubleshooting', link: '/resources/troubleshooting' },
                    { text: 'Migration Guide', link: '/resources/migration' },
                    { text: 'Contributing', link: '/resources/contributing' },
                ]
            }
        ],

        socialLinks: [
            { icon: 'github', link: 'https://github.com/nyalajs/nyala' },
            { icon: 'discord', link: 'https://discord.gg/nyalajs' },
            { icon: 'twitter', link: 'https://twitter.com/nyalajs' }
        ],

        footer: {
            message: 'Released under the MIT License.',
            copyright: 'Copyright © 2024 Nyala Framework'
        },

        search: {
            provider: 'local'
        },

        editLink: {
            pattern: 'https://github.com/nyalajs/nyala/edit/main/website/docs/:path',
            text: 'Edit this page on GitHub'
        }
    },

    head: [
        ['link', { rel: 'icon', href: '/favicon.ico' }],
        ['meta', { name: 'theme-color', content: '#3eaf7c' }],
        ['meta', { name: 'apple-mobile-web-app-capable', content: 'yes' }],
        ['meta', { name: 'apple-mobile-web-app-status-bar-style', content: 'black' }]
    ]
})

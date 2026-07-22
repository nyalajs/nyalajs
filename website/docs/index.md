---
layout: home

hero:
  name: Nyala
  text: Enterprise TypeScript Framework
  tagline: Build production-ready applications with confidence
  image:
    src: /logo.svg
    alt: Nyala
  actions:
    - theme: brand
      text: Get Started
      link: /getting-started
    - theme: alt
      text: View on GitHub
      link: https://github.com/nyalajs/nyala

features:
  - icon: 🏗️
    title: Complete MVC Architecture
    details: Clean separation of concerns with Controllers, Services, and Repositories. Everything has its place.

  - icon: 🔐
    title: Authentication Built-in
    details: JWT authentication with refresh tokens. Secure by default. Production-ready out of the box.

  - icon: 🏢
    title: Multi-Tenancy Native
    details: Build SaaS applications with automatic data isolation. No manual tenant filtering required.

  - icon: ⚡
    title: TypeScript First
    details: Full type safety end-to-end. IntelliSense everywhere. Catch errors at compile time.

  - icon: 📦
    title: Zero Configuration
    details: Sensible defaults that just work. Start building features immediately.

  - icon: 🎨
    title: Developer Experience
    details: Elegant APIs. Comprehensive CLI. Hot reload. Everything you need to move fast.

  - icon: 🛡️
    title: Production Ready
    details: Security defaults, structured logging, health checks, Docker support built-in.

  - icon: 🚀
    title: Instant Start
    details: Complete starter templates. Not just scaffolding - fully functional applications.

  - icon: 📚
    title: Enterprise Grade
    details: Audit logging, observability, multi-tenancy, RBAC. Everything enterprises need.
---

## Quick Start

```bash
# Install CLI
npm install -g @nyalajs/cli

# Create application
nyala new my-app

# Start building
cd my-app
npm install
npm run dev
```

## What You Get

When you create a Nyala application, you get a complete, production-ready setup:

::: code-group

```typescript [Controller]
@Controller('/users')
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Get('/')
  async index(@Query() query: PaginationDto) {
    return this.usersService.findAll(query);
  }

  @Post('/')
  @UseValidation(CreateUserValidator)
  async store(@Body() dto: CreateUserDto) {
    re
  async findByEmail(email: string) {
    return this.findOne(eq(users.email, email));
  }
}
```

:::

## Why Nyala?

<div class="why-grid">

### For Startups
Ship faster with complete templates. Focus on product, not infrastructure.

### For SaaS
Multi-tenancy built-in. Automatic data isolation. Scale with confidence.

### For Agencies
Consistent structure. Easy onboarding. Faster delivery.

### For Enterprise
Type-safe. Scalable. Auditable. Production-ready security.

</div>

## Trusted By Developers

<div class="stats">
  <div class="stat">
    <div class="stat-value">20+</div>
    <div class="stat-label">Packages</div>
  </div>
  <div class="stat">
    <div class="stat-value">3</div>
    <div class="stat-label">Templates</div>
  </div>
  <div class="stat">
    <div class="stat-value">100%</div>
    <div class="stat-label">TypeScript</div>
  </div>
  <div class="stat">
    <div class="stat-value">MIT</div>
    <div class="stat-label">License</div>
  </div>
</div>

<style>
.why-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 2rem;
  margin: 2rem 0;
}

.why-grid > div {
  padding: 1.5rem;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
}

.why-grid h3 {
  margin-top: 0;
  color: var(--vp-c-brand);
}

.stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 2rem;
  margin: 3rem 0;
  text-align: center;
}

.stat-value {
  font-size: 3rem;
  font-weight: bold;
  color: var(--vp-c-brand);
}

.stat-label {
  font-size: 1rem;
  color: var(--vp-c-text-2);
  margin-top: 0.5rem;
}
</style>

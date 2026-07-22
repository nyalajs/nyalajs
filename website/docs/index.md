---
layout: home

hero:
  name: Nyala
  text: Enterprise TypeScript Framework
  tagline: Build production-ready applications with confidence
  image:
    src: /logo.png
    alt: Nyala Framework Logo
  actions:
    - theme: brand
      text: Get Started
      link: /getting-started
    - theme: alt
      text: View on GitHub
      link: https://github.com/nyalajs/nyalajs
    - theme: alt
      text: NPM Packages
      link: https://www.npmjs.com/org/nyalajs

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
    title: Modular Packages
    details: Install only what you need. 15+ focused packages on npm under @nyalajs organization.

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
import { Controller, Get, Post, Body, Query } from "@nyalajs/core";
import { ValidateBody } from "@nyalajs/validation";

@Controller('/users')
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Get('/')
  async index(@Query() query: PaginationDto) {
    return this.usersService.findAll(query);
  }

  @Post('/')
  @ValidateBody(CreateUserValidator)
  async store(@Body() dto: CreateUserDto) {
    return this.usersService.create(dto);
  }
}
```

```typescript [Service]
import { Injectable } from "@nyalajs/core";

@Injectable()
export class UsersService {
  constructor(private userRepo: UserRepository) {}

  async findAll(query: PaginationDto) {
    return this.userRepo.findAll({
      limit: query.limit,
      offset: query.offset
    });
  }

  async create(dto: CreateUserDto) {
    return this.userRepo.create(dto);
  }
}
```

```typescript [Repository]
import { Injectable } from "@nyalajs/core";
import { BaseRepository } from "@nyalajs/database";

@Injectable()
export class UserRepository extends BaseRepository<User> {
  constructor() {
    super(users);
  }

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
    <div class="stat-value">18</div>
    <div class="stat-label">NPM Packages</div>
  </div>
  <div class="stat">
    <div class="stat-value">2</div>
    <div class="stat-label">Production Templates</div>
  </div>
  <div class="stat">
    <div class="stat-value">100%</div>
    <div class="stat-label">TypeScript</div>
  </div>
  <div class="stat">
    <div class="stat-value">MIT</div>
    <div class="stat-label">Open Source</div>
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

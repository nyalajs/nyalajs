# Nyala

<div align="center">

**Enterprise TypeScript Framework for Production-Ready Applications**

[![npm version](https://img.shields.io/npm/v/@nyalajs/cli.svg)](https://www.npmjs.com/package/@nyalajs/cli)
[![npm downloads](https://img.shields.io/npm/dm/@nyalajs/cli.svg)](https://www.npmjs.com/package/@nyalajs/cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue.svg)](https://www.typescriptlang.org/)

[Documentation](https://github.com/nyalajs/nyalajs#readme) · [Quick Start](#quick-start) · [NPM Packages](https://www.npmjs.com/org/nyalajs) · [Examples](./examples)

</div>

---

## About

Nyala is a production-ready TypeScript framework for building modern applications. Build with confidence using:

- 🏗️ **Complete MVC Architecture** - Controllers, Services, Repositories
- 🔐 **Built-in Authentication** - JWT with refresh tokens
- 🏢 **Multi-Tenancy** - Automatic data isolation for SaaS
- 📦 **Starter Templates** - Complete applications, not just scaffolding
- 🎨 **Elegant Patterns** - Intuitive APIs, clean architecture
- ⚡ **TypeScript-First** - Full type safety end-to-end

## Available Packages

Nyala is distributed as a monorepo with focused packages. Install only what you need:

| Package | Version | Description |
|---------|---------|-------------|
| [@nyalajs/cli](https://www.npmjs.com/package/@nyalajs/cli) | ![npm](https://img.shields.io/npm/v/@nyalajs/cli) | Command-line interface for scaffolding |
| [@nyalajs/core](https://www.npmjs.com/package/@nyalajs/core) | ![npm](https://img.shields.io/npm/v/@nyalajs/core) | Core framework with DI and decorators |
| [@nyalajs/http](https://www.npmjs.com/package/@nyalajs/http) | ![npm](https://img.shields.io/npm/v/@nyalajs/http) | HTTP server and routing |
| [@nyalajs/database](https://www.npmjs.com/package/@nyalajs/database) | ![npm](https://img.shields.io/npm/v/@nyalajs/database) | Database ORM and migrations |
| [@nyalajs/validation](https://www.npmjs.com/package/@nyalajs/validation) | ![npm](https://img.shields.io/npm/v/@nyalajs/validation) | Request validation with Zod |
| [@nyalajs/security](https://www.npmjs.com/package/@nyalajs/security) | ![npm](https://img.shields.io/npm/v/@nyalajs/security) | Authentication and authorization |
| [@nyalajs/tenancy](https://www.npmjs.com/package/@nyalajs/tenancy) | ![npm](https://img.shields.io/npm/v/@nyalajs/tenancy) | Multi-tenant support |
| [@nyalajs/cache](https://www.npmjs.com/package/@nyalajs/cache) | ![npm](https://img.shields.io/npm/v/@nyalajs/cache) | Caching with Redis/Memory |
| [@nyalajs/queue](https://www.npmjs.com/package/@nyalajs/queue) | ![npm](https://img.shields.io/npm/v/@nyalajs/queue) | Background job processing |
| [@nyalajs/mail](https://www.npmjs.com/package/@nyalajs/mail) | ![npm](https://img.shields.io/npm/v/@nyalajs/mail) | Email sending |
| [@nyalajs/storage](https://www.npmjs.com/package/@nyalajs/storage) | ![npm](https://img.shields.io/npm/v/@nyalajs/storage) | File storage (S3, local) |
| [@nyalajs/events](https://www.npmjs.com/package/@nyalajs/events) | ![npm](https://img.shields.io/npm/v/@nyalajs/events) | Event dispatching |
| [@nyalajs/config](https://www.npmjs.com/package/@nyalajs/config) | ![npm](https://img.shields.io/npm/v/@nyalajs/config) | Configuration management |
| [@nyalajs/observability](https://www.npmjs.com/package/@nyalajs/observability) | ![npm](https://img.shields.io/npm/v/@nyalajs/observability) | Logging and monitoring |
| [@nyalajs/testing](https://www.npmjs.com/package/@nyalajs/testing) | ![npm](https://img.shields.io/npm/v/@nyalajs/testing) | Testing utilities |

[View all packages on npm →](https://www.npmjs.com/org/nyalajs)

## Quick Start

```bash
# Install CLI
npm install -g @nyalajs/cli

# Create new application
nyala new my-app

# Start development
cd my-app
npm install
npm run dev
```

**That's it!** You now have a fully functional application with authentication, user management, and database setup.

[→ Full Quick Start Guide](./QUICK_START.md)

## Templates

Choose the template that fits your needs:

### Basic Starter

Complete application with authentication and user management.

```bash
nyala new my-app --template=basic-starter
```

**Includes:**
- JWT authentication (register, login, refresh)
- User CRUD operations
- Database migrations & seeders
- Request validation
- Docker setup
- Complete documentation

[→ Basic Template Guide](./templates/basic-starter/README.md)

### SaaS Starter

Multi-tenant application with automatic data isolation.

```bash
nyala new my-saas --template=saas-starter
```

**Includes:**
- Everything from Basic template
- Multi-tenancy with data isolation
- Tenant management
- Cross-tenant protection
- Role-based access control

[→ SaaS Template Guide](./templates/saas-starter/README.md)

## Features

| Feature | Basic | SaaS |
|---------|-------|------|
| MVC Architecture | ✅ | ✅ |
| Authentication | ✅ | ✅ |
| User Management | ✅ | ✅ |
| Multi-Tenancy | ❌ | ✅ |
| Database Migrations | ✅ | ✅ |
| Docker Setup | ✅ | ✅ |
| Request Validation | ✅ | ✅ |
| Type Safety | ✅ | ✅ |
| Documentation | ✅ | ✅ |

## Example

```typescript
import { Controller, Get, Post, Body, Query } from "@nyalajs/core";
import { ValidateBody } from "@nyalajs/validation";
import { AuthGuard } from "@nyalajs/security";

// controllers/users.controller.ts
@Controller('/users')
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Get('/')
  @UseGuards(AuthGuard)
  async index(@Query() query: PaginationDto) {
    return this.usersService.findAll(query);
  }

  @Post('/')
  @ValidateBody(CreateUserValidator)
  async store(@Body() dto: CreateUserDto) {
    return this.usersService.create(dto);
  }
}

// services/users.service.ts
import { Injectable } from "@nyalajs/core";

@Injectable()
export class UsersService {
  constructor(private userRepo: UserRepository) {}

  async create(dto: CreateUserDto) {
    const user = await this.userRepo.create(dto);
    return user;
  }
}
```

## Documentation

- **[Getting Started](./docs/installation.md)** - Installation guide
- **[Quick Start](./QUICK_START.md)** - Build your first app
- **[Core Concepts](./docs/core-concepts.md)** - Architecture overview
- **[Multi-Tenancy](./docs/multi-tenancy.md)** - Building SaaS apps
- **[Security](./docs/security.md)** - Authentication & authorization
- **[API Reference](./docs/api-reference.md)** - Complete API docs

[→ Full Documentation](./docs/index.md)

## Community & Support

- **[GitHub](https://github.com/nyalajs/nyalajs)** - Source code, issues, discussions
- **[npm Organization](https://www.npmjs.com/org/nyalajs)** - Published packages
- **[Documentation](./docs/index.md)** - Complete guides and API reference
- **[Examples](./examples)** - Sample applications
- **[Changelog](./CHANGELOG.md)** - Version history and updates

## Contributing

We welcome contributions! See [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

## License

MIT © [Hailemariyam Kebede](https://github.com/Hailemariyam)

---

<div align="center">

**[Get Started](./docs/installation.md)** · **[NPM Packages](https://www.npmjs.com/org/nyalajs)** · **[GitHub](https://github.com/nyalajs/nyalajs)**

Made with ❤️ for the TypeScript community

</div>

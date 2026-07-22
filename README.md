# Nyala

<div align="center">

**Enterprise TypeScript Framework for Production-Ready Applications**

[![npm version](https://img.shields.io/npm/v/@nyala/cli.svg)](https://www.npmjs.com/package/@nyala/cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue.svg)](https://www.typescriptlang.org/)

[Documentation](./docs/index.md) · [Quick Start](./QUICK_START.md) · [Templates](#templates) · [Examples](./examples)

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

## Quick Start

```bash
# Install CLI
npm install -g @nyala/cli

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

### MVC Starter (Recommended)

Complete MVC application with authentication and user management.

```bash
nyala new my-app --template=mvc
```

**Includes:**
- JWT authentication (register, login, refresh)
- User CRUD operations
- Database migrations & seeders
- Request validation
- Docker setup
- Complete documentation

[→ MVC Template Guide](./templates/mvc-starter/README.md)

### SaaS Starter

Multi-tenant application with automatic data isolation.

```bash
nyala new my-saas --template=saas
```

**Includes:**
- Everything from MVC template
- Multi-tenancy with data isolation
- Tenant management
- Cross-tenant protection
- Role-based access control

[→ SaaS Template Guide](./templates/saas-starter/README.md)

### Basic

Minimal setup for custom projects.

```bash
nyala new my-app --template=basic
```

## Features

| Feature | MVC | SaaS | Basic |
|---------|-----|------|-------|
| MVC Architecture | ✅ | ✅ | ✅ |
| Authentication | ✅ | ✅ | ❌ |
| User Management | ✅ | ✅ | ❌ |
| Multi-Tenancy | ❌ | ✅ | ❌ |
| Database Migrations | ✅ | ✅ | ✅ |
| Docker Setup | ✅ | ✅ | ✅ |
| Documentation | ✅ | ✅ | ✅ |

## Example

```typescript
// controllers/users.controller.ts
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
    return this.usersService.create(dto);
  }
}

// services/users.service.ts
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

- **[Introduction](./docs/introduction.md)** - What is Nyala?
- **[Installation](./docs/installation.md)** - Get started
- **[Quick Start](./QUICK_START.md)** - Your first app
- **[Architecture](./docs/architecture.md)** - Core concepts
- **[Multi-Tenancy](./docs/multi-tenancy.md)** - Building SaaS
- **[CLI Commands](./docs/cli-commands.md)** - All commands
- **[API Reference](./docs/api/decorators.md)** - Complete API

[→ Full Documentation](./docs/index.md)

## CLI Commands

```bash
# Create new project
nyala new my-app

# Generate components
nyala generate controller Products
nyala generate service Orders
nyala generate model Product

# Database operations
nyala db:migrate
nyala db:seed

# Development
nyala dev
```

[→ All CLI Commands](./docs/cli-commands.md)

## Why Nyala?

### For Startups

Ship faster with complete templates. Focus on business logic, not boilerplate.

### For SaaS Companies

Multi-tenancy built-in. Automatic data isolation. No manual tenant filtering.

### For Agencies

Consistent project structure. Easy onboarding. Faster development.

### For Enterprise

Type-safe. Scalable. Testable. Production-ready security defaults.

## Community

- **[GitHub](https://github.com/nyalajs/nyala)** - Source code & issues
- **[Discord](https://discord.gg/nyalajs)** - Community chat
- **[Twitter](https://twitter.com/nyalajs)** - Updates & news
- **[Documentation](./docs/index.md)** - Full guides

## Contributing

We welcome contributions! See [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

## License

MIT © [Nyala Framework Team](https://github.com/nyalajs)

---

<div align="center">

**[Get Started](./docs/installation.md)** · **[Documentation](./docs/index.md)** · **[Examples](./examples)**

Made with ❤️ by developers, for developers

</div>

# Introduction

## What is Nyala?

Nyala is a production-ready TypeScript framework designed for building modern, scalable applications. It provides elegant patterns and exceptional developer experience for the TypeScript/Node.js ecosystem.

## Why Nyala?

### 🎯 Production-Ready Out of the Box

Unlike minimal frameworks that leave you to figure out the architecture, Nyala provides:

- Complete MVC architecture
- Built-in authentication
- Database migrations & seeders
- Multi-tenancy support
- Docker configuration
- Testing structure

### 🚀 Developer Experience First

```bash
# One command to start
nyala new my-app
cd my-app
npm install
npm run dev
```

That's it! You have a fully functional application with:
- Authentication (register, login, JWT)
- User management (CRUD)
- Database setup
- Validation
- Documentation

### 🏗️ Clean MVC Architecture

Elegant, intuitive patterns that make development enjoyable:

```typescript
// Controllers
@Controller('/users')
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Get('/')
  async index() {
    return this.usersService.findAll();
  }
}

// Services
@Injectable()
export class UsersService {
  constructor(private userRepo: UserRepository) {}

  async findAll() {
    return this.userRepo.findAll();
  }
}
```

### 🏢 Built-in Multi-Tenancy

Perfect for SaaS applications. Tenant isolation is automatic:

```typescript
// Repositories automatically filter by tenant
const users = await userRepository.findAll();
// Only returns current tenant's users - no manual filtering needed!
```

### 📦 Complete Starter Templates

Choose what fits your needs:

- **Basic Starter** - Authentication and user management
- **SaaS Starter** - Multi-tenant application with tenant isolation

Both templates are production-ready with authentication, validation, migrations, and Docker setup.

## Core Features

- **TypeScript-First** - Full type safety end-to-end
- **Dependency Injection** - Automatic resolution with decorators
- **Database ORM** - Drizzle ORM with migrations
- **Validation** - Zod-based request validation
- **Authentication** - JWT with refresh tokens
- **Authorization** - Role-based access control
- **Multi-Tenancy** - Automatic data isolation
- **CLI Tools** - Code generators for everything
- **Docker Ready** - Complete containerization
- **Testing** - Unit, integration, E2E structure

## Philosophy

Nyala follows these principles:

1. **Convention over Configuration** - Sensible defaults, minimal setup
2. **Developer Happiness** - Elegant APIs, great DX
3. **Production-Ready** - Enterprise features built-in
4. **Type Safety** - TypeScript throughout
5. **Testability** - Easy to test, dependency injection
6. **Scalability** - Multi-tenancy, microservice-ready

## Comparison

### vs Express

| Feature | Express | Nyala |
|---------|---------|-------|
| Structure | Minimal | Complete MVC |
| TypeScript | Optional | First-class |
| Authentication | DIY | Built-in |
| Validation | Manual | Decorators |
| Multi-Tenancy | Manual | Built-in |
| Dependency Injection | None | Built-in |
| CLI Tools | None | Comprehensive |

### vs NestJS

| Feature | NestJS | Nyala |
|---------|--------|-------|
| Learning Curve | Steep | Gentle |
| Multi-Tenancy | Manual | Built-in |
| Templates | Basic | Complete apps |
| Boilerplate | Heavy | Minimal |
| Documentation | Complex | Clear |

## Who Uses Nyala?

Nyala is perfect for:

- **Startups** - Ship faster with complete templates
- **SaaS Companies** - Multi-tenancy built-in
- **Agencies** - Consistent project structure
- **Enterprise** - Type-safe, scalable, testable
- **Developers** - Enjoyable development experience

## Community

- **[GitHub](https://github.com/nyalajs/nyalajs)** - Source code, issues, and discussions
- **[NPM](https://www.npmjs.com/org/nyalajs)** - Published packages

## Next Steps

Ready to start? Head to [Installation](./installation.md) to get Nyala running.

Want to dive deeper? Check out our [Core Concepts Guide](./core-concepts.md).

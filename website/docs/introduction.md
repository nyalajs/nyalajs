# Introduction

## What is Nyala?

Nyala is an enterprise-grade TypeScript framework designed for building production-ready applications with confidence. It provides a complete MVC architecture, built-in authentication, multi-tenancy support, and all the tools you need to ship modern applications fast.

## Philosophy

Nyala is built on four core principles:

### Convention over Configuration

Start building features immediately with sensible defaults. No endless configuration files. Everything works out of the box.

### Developer Experience First

Elegant APIs, intuitive patterns, and comprehensive tooling. Development should be enjoyable, not frustrating.

### Production-Ready by Default

Security defaults, structured logging, health checks, Docker support. Everything enterprises need is built-in.

### Type Safety Throughout

Full TypeScript support with end-to-end type safety. Catch errors at compile time, not in production.

## Key Features

### Complete MVC Architecture

Clean separation of concerns with Controllers, Services, and Repositories. Each component has a clear responsibility:

- **Controllers** - Handle HTTP requests and responses
- **Services** - Contain business logic
- **Repositories** - Manage data access
- **Models** - Define data structures
- **DTOs** - Type-safe data transfer objects
- **Validators** - Request validation rules

### Built-in Authentication

JWT authentication with refresh tokens, password hashing, and secure defaults:

```typescript
@Controller('/auth')
export class AuthController {
  @Post('/register')
  @UseValidation(RegisterValidator)
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('/login')
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }
}
```

### Multi-Tenancy Native

Build SaaS applications with automatic data isolation. No manual tenant filtering required:

```typescript
// Repositories automatically scope to current tenant
const users = await userRepository.findAll();
// Only returns the current tenant's users
```

### TypeScript First

Full type safety from request to database:

```typescript
interface CreateUserDto {
  email: string;
  password: string;
  name: string;
}

@Post('/')
@UseValidation(CreateUserValidator)
async create(@Body() dto: CreateUserDto): Promise<User> {
  return this.usersService.create(dto);
}
```

### Zero Configuration

One command to create a fully functional application:

```bash
nyala new my-app
cd my-app
npm run dev
```

## Who Uses Nyala?

### Startups

Ship faster with complete templates. Focus on product features, not infrastructure setup.

### SaaS Companies

Multi-tenancy built-in from day one. Scale from 1 to 10,000 tenants without refactoring.

### Development Agencies

Consistent project structure across all clients. Faster onboarding, easier maintenance.

### Enterprise Teams

Type-safe, scalable, auditable. Security defaults and compliance-ready features built-in.

## Ecosystem

Nyala includes everything you need:

- **@nyalajs/core** - Framework core with DI, decorators, lifecycle
- **@nyalajs/cli** - Project generation and code scaffolding
- **@nyalajs/auth** - Authentication and authorization
- **@nyalajs/tenancy** - Multi-tenancy support
- **@nyalajs/validation** - Request validation
- **@nyalajs/database** - Database utilities and migrations

## Quick Example

Here's a complete CRUD controller:

```typescript
@Controller('/products')
export class ProductsController {
  constructor(private productsService: ProductsService) {}

  @Get('/')
  async index(@Query() query: PaginationDto) {
    return this.productsService.findAll(query);
  }

  @Get('/:id')
  async show(@Param('id') id: string) {
    return this.productsService.findById(id);
  }

  @Post('/')
  @UseValidation(CreateProductValidator)
  async store(@Body() dto: CreateProductDto) {
    return this.productsService.create(dto);
  }

  @Put('/:id')
  @UseValidation(UpdateProductValidator)
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateProductDto
  ) {
    return this.productsService.update(id, dto);
  }

  @Delete('/:id')
  async destroy(@Param('id') id: string) {
    await this.productsService.delete(id);
    return { message: 'Product deleted successfully' };
  }
}
```

## Next Steps

<div class="next-steps">

**[Installation →](./installation)**
Get Nyala installed and create your first project

**[Quick Start →](./quick-start)**
Build your first feature in 5 minutes

**[Core Concepts →](./concepts/architecture)**
Understand Nyala's architecture

**[Templates →](./cli/templates)**
Choose the right template for your project

</div>

## Community & Support

- **[GitHub](https://github.com/nyalajs/nyala)** - Source code, issues, discussions
- **[Discord](https://discord.gg/nyalajs)** - Community chat and support
- **[Twitter](https://twitter.com/nyalajs)** - Updates and announcements

<style>
.next-steps {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 1rem;
  margin: 2rem 0;
}

.next-steps a {
  display: block;
  padding: 1.5rem;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  text-decoration: none;
  transition: all 0.2s;
}

.next-steps a:hover {
  border-color: var(--vp-c-brand);
  transform: translateY(-2px);
}

.next-steps strong {
  display: block;
  font-size: 1.1rem;
  margin-bottom: 0.5rem;
  color: var(--vp-c-brand);
}
</style>

# Nyala Quick Reference

## Creating Projects

```bash
# Interactive (recommended)
nyala new

# MVC Application
nyala new blog --template=mvc --database=postgres

# SaaS Application
nyala new my-saas --template=saas

# Minimal Setup
nyala new simple --template=basic
```

## Project Setup

```bash
# After creating project
cd my-app
npm install
cp .env.example .env

# Edit .env with your settings
# Then run migrations
npm run db:migrate
npm run db:seed  # Optional: seed with sample data

# Start development
npm run dev
```

## Code Generation

```bash
# Controllers
nyala generate controller Products
nyala g controller Users  # Short form

# Services
nyala generate service Orders
nyala g service Products

# Models
nya migration
npm run db:rollback

# Drop all tables and re-run migrations
npm run db:fresh

# Fresh + seed
npm run db:fresh --seed

# Run seeders
npm run db:seed

# Run specific seeder
npm run db:seed --class=UserSeeder
```

## Development

```bash
# Start dev server (hot reload)
npm run dev

# Build for production
npm run build

# Start production server
npm start

# Run tests
npm test
npm run test:unit
npm run test:integration
npm run test:e2e
npm run test:coverage

# Lint and format
npm run lint
npm run lint:fix
npm run format
```

## Docker

```bash
# Build image
docker build -t my-app .

# Run with docker-compose
docker-compose up -d

# View logs
docker-compose logs -f app

# Stop
docker-compose down
```

## MVC Architecture

### Controller (Thin - HTTP layer only)
```typescript
@Controller("/users")
export class UsersController {
    constructor(private usersService: UsersService) {}

    @Get("/:id")
    async show(@Param("id") id: string) {
        return this.usersService.findOne(id);
    }
}
```

### Service (Business logic)
```typescript
@Injectable()
export class UsersService {
    constructor(
        private userRepository: UserRepository,
        private logger: Logger
    ) {}

    async findOne(id: string): Promise<User | null> {
        const user = await this.userRepository.findById(id);
        this.logger.info("User fetched", { id });
        return user;
    }
}
```

### Repository (Data access)
```typescript
@Injectable()
export class UserRepository extends BaseRepository<User> {
    constructor() {
        super(users);
    }

    async findByEmail(email: string): Promise<User | null> {
        return this.findOne(eq(users.email, email));
    }
}
```

### Model (Database schema)
```typescript
export const users = pgTable("users", {
    id: uuid("id").primaryKey().defaultRandom(),
    name: varchar("name", { length: 255 }).notNull(),
    email: varchar("email", { length: 255 }).notNull().unique(),
    createdAt: timestamp("created_at").defaultNow(),
});

export type User = InferSelectModel<typeof users>;
```

### Validator (Request validation)
```typescript
export const CreateUserValidator = z.object({
    name: z.string().min(2).max(255),
    email: z.string().email(),
    password: z.string().min(8),
});
```

### DTO (Data transfer)
```typescript
export class CreateUserDto {
    name!: string;
    email!: string;
    password!: string;
}
```

## Multi-Tenancy (SaaS Template)

### Tenant-Aware Repository
```typescript
@Injectable()
export class UserRepository extends BaseRepository<User> {
    constructor() {
        super(users, true); // true = tenant-aware
    }

    // All queries automatically filtered by current tenant
    async findAll() {
        return super.findAll(); // Only returns current tenant's users
    }
}
```

### Accessing Tenant Context
```typescript
import { RequestContext } from "@nyalajs/core";

const context = RequestContext.get();
const tenant = context.tenant;  // Current tenant
const user = context.user;      // Current user
```

### Creating Tenant-Scoped Records
```typescript
// tenantId automatically added
const user = await userRepository.create({
    name: "John Doe",
    email: "john@example.com",
    // tenantId added from context
});
```

## Environment Variables

### MVC Template
```env
# Application
NODE_ENV=development
APP_NAME="My App"
PORT=3000

# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=myapp
DB_USER=postgres
DB_PASSWORD=

# Authentication
JWT_SECRET=your-secret-key
JWT_EXPIRES_IN=1h
```

### SaaS Template (Additional)
```env
# Multi-Tenancy
TENANT_RESOLUTION=subdomain
BASE_DOMAIN=yoursaas.com
TENANT_HEADER=X-Tenant-ID

# Audit
AUDIT_ENABLED=true
```

## API Endpoints (MVC Template)

```
Authentication
POST   /auth/register    Register new user
POST   /auth/login       Login
POST   /auth/refresh     Refresh token
GET    /auth/me          Get current user
POST   /auth/logout      Logout

Users
GET    /users            List users (paginated)
GET    /users/:id        Get user
POST   /users            Create user
PUT    /users/:id        Update user
DELETE /users/:id        Delete user

Health
GET    /health           Health check
GET    /health/live      Liveness probe
GET    /health/ready     Readiness probe
```

## Common Patterns

### Pagination
```typescript
@Get("/")
async index(
    @Query("page") page: number = 1,
    @Query("limit") limit: number = 10
) {
    return this.service.findAll(page, limit);
}
```

### Validation
```typescript
@Post("/")
@UseValidation(CreateUserValidator)
async store(@Body() dto: CreateUserDto) {
    return this.service.create(dto);
}
```

### Error Handling
```typescript
try {
    return await this.service.create(dto);
} catch (error) {
    return {
        statusCode: 400,
        message: error.message,
    };
}
```

## Debugging

```bash
# Check logs
tail -f storage/logs/app.log

# Database connections
psql -U postgres -d myapp

# View migrations status
npm run db:status

# Test endpoints
curl http://localhost:3000/health

# With auth
curl -H "Authorization: Bearer <token>" \
     http://localhost:3000/users
```

## Troubleshooting

### Port already in use
```bash
# Change PORT in .env or kill process
lsof -ti:3000 | xargs kill -9
```

### Database connection error
```bash
# Check database is running
docker-compose up -d postgres

# Verify credentials in .env
# Run migrations
npm run db:migrate
```

### Module not found
```bash
# Clear and reinstall
rm -rf node_modules package-lock.json
npm install
```

### TypeScript errors
```bash
# Rebuild
npm run build
```

## Resources

- [Full Documentation](./docs/)
- [MVC Architecture Guide](./templates/mvc-starter/docs/ARCHITECTURE.md)
- [Multi-Tenancy Guide](./templates/saas-starter/docs/MULTI_TENANCY.md)
- [API Reference](./docs/api-reference.md)
- [Deployment Guide](./docs/deployment.md)

## Getting Help

- Discord: https://discord.gg/nyalajs
- GitHub Issues: https://github.com/nyalajs/nyala/issues
- Documentation: https://nyalajs.dev

## Tips

💡 Use `nyala generate resource product` to create model, controller, service, and repository at once

💡 Always use repositories instead of direct database queries for multi-tenant apps

💡 Run `npm run lint:fix` before committing

💡 Use `npm run test:watch` during development

💡 Check `npm run db:fresh --seed` to reset your dev database

💡 Environment variables in .env are loaded automatically

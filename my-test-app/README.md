# Nyala MVC Starter Template

A production-ready MVC application built with Nyala Framework following Laravel-style conventions.

## Features

✅ **Clean MVC Architecture** - Organized with Controllers, Models, and Views separation
✅ **Database Integration** - Drizzle ORM with migrations, seeders, and model repositories
✅ **Authentication** - JWT-based authentication system
✅ **Validation** - Zod-based request validation
✅ **Error Handling** - Centralized exception handling
✅ **Logging** - Structured logging with request tracking
✅ **Testing** - Complete test suite with Vitest
✅ **CLI Integration** - Generate models, controllers, services, and more
✅ **API Documentation** - Auto-generated API docs
✅ **Docker Ready** - Containerized for easy deployment

## Quick Start

```bash
# Install dependencies
npm install

# Setup environment
cp .env.example .env
# Edit .env with your configuration

# Run database migrations
npm run db:migrate

# Seed database with sample data
npm run db:seed

# Start development server
npm run dev

# Build for production
npm run build

# Start production server
npm start
```

## Project Structure

```
app/
├── controllers/        # HTTP request handlers
│   ├── auth.controller.ts
│   ├── home.controller.ts
│   └── users.controller.ts
├── models/             # Database models (Drizzle schemas)
│   ├── user.model.ts
│   └── index.ts
├── services/           # Business logic layer
│   ├── auth.service.ts
│   └── users.service.ts
├── repositories/       # Data access layer
│   ├── base.repository.ts
│   └── user.repository.ts
├── middleware/         # Custom middleware
│   ├── auth.middleware.ts
│   └── logging.middleware.ts
├── validators/         # Request validation schemas
│   └── user.validator.ts
├── dto/                # Data Transfer Objects
│   ├── create-user.dto.ts
│   └── update-user.dto.ts
├── exceptions/         # Custom exceptions
│   └── validation.exception.ts
├── helpers/            # Utility functions
│   └── password.helper.ts
└── resources/          # Response transformers
    └── user.resource.ts

bootstrap/
├── app.module.ts       # Application root module
└── main.ts             # Application entry point

config/                 # Configuration files
├── app.ts              # App settings
├── server.ts           # Server configuration
├── database.ts         # Database connection
├── auth.ts             # Authentication config
├── cors.ts             # CORS settings
├── logging.ts          # Logging configuration
└── index.ts            # Config aggregator

database/
├── migrations/         # Database migrations
│   ├── 0001_create_users_table.ts
│   └── README.md
├── seeders/            # Database seeders
│   ├── user.seeder.ts
│   └── README.md
├── factories/          # Test data factories
│   ├── user.factory.ts
│   └── README.md
└── schema/             # Drizzle ORM schemas (alias to app/models)

routes/
└── api.ts              # Route definitions

tests/
├── unit/               # Unit tests
├── integration/        # Integration tests
└── e2e/                # End-to-end tests

public/                 # Static assets
storage/                # Application storage
├── logs/
├── uploads/
└── cache/

docs/                   # Documentation
└── api.md              # API documentation

.env                    # Environment variables
.env.example            # Environment template
docker-compose.yml      # Local development stack
Dockerfile              # Production container
```

## MVC Architecture

### Controllers
Handle HTTP requests and responses. Keep them thin - delegate business logic to services.

```typescript
@Controller("/users")
export class UsersController {
    constructor(private usersService: UsersService) {}

    @Get("/")
    async index(@Query() query: PaginationDto) {
        const users = await this.usersService.findAll(query);
        return UserResource.collection(users);
    }

    @Post("/")
    @UseValidation(CreateUserValidator)
    async store(@Body() dto: CreateUserDto) {
        const user = await this.usersService.create(dto);
        return new UserResource(user);
    }
}
```

### Models
Define database schema using Drizzle ORM.

```typescript
export const users = pgTable("users", {
    id: uuid("id").primaryKey().defaultRandom(),
    name: varchar("name", { length: 255 }).notNull(),
    email: varchar("email", { length: 255 }).notNull().unique(),
    password: varchar("password", { length: 255 }).notNull(),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
});
```

### Services
Contain business logic and coordinate between repositories.

```typescript
@Injectable()
export class UsersService {
    constructor(private userRepo: UserRepository) {}

    async create(dto: CreateUserDto): Promise<User> {
        const hashedPassword = await hash(dto.password);
        return this.userRepo.create({
            ...dto,
            password: hashedPassword,
        });
    }
}
```

### Repositories
Handle data access and database queries.

```typescript
@Injectable()
export class UserRepository extends BaseRepository<User> {
    constructor() {
        super(users);
    }

    async findByEmail(email: string): Promise<User | null> {
        return this.findOne({ where: { email } });
    }
}
```

## API Endpoints

### Authentication
- `POST /auth/register` - Register new user
- `POST /auth/login` - Login
- `POST /auth/refresh` - Refresh access token
- `GET /auth/me` - Get current user
- `POST /auth/logout` - Logout

### Users
- `GET /users` - List all users (paginated)
- `GET /users/:id` - Get user by ID
- `POST /users` - Create new user
- `PUT /users/:id` - Update user
- `DELETE /users/:id` - Delete user

### Health
- `GET /health` - Health check
- `GET /health/live` - Liveness probe
- `GET /health/ready` - Readiness probe

## CLI Commands

Generate new components:

```bash
# Generate controller
nyala generate controller Products

# Generate service
nyala generate service Products

# Generate model
nyala generate model Product

# Generate repository
nyala generate repository Product

# Generate validator
nyala generate validator Product

# Generate migration
nyala generate migration create_products_table

# Generate seeder
nyala generate seeder products

# Generate factory
nyala generate factory product

# Generate complete resource (model + controller + service + repository)
nyala generate resource product
```

Database commands:

```bash
# Run migrations
npm run db:migrate

# Rollback last migration
npm run db:rollback

# Reset database (drop all tables and re-run migrations)
npm run db:fresh

# Reset and seed
npm run db:fresh --seed

# Run seeders
npm run db:seed

# Run specific seeder
npm run db:seed --class=UserSeeder
```

## Testing

```bash
# Run all tests
npm test

# Run unit tests
npm run test:unit

# Run integration tests
npm run test:integration

# Run E2E tests
npm run test:e2e

# Run with coverage
npm run test:coverage

# Watch mode
npm run test:watch
```

## Database Migrations

Create a new migration:

```bash
nyala generate migration create_products_table
```

Migration file example:

```typescript
import { sql } from "drizzle-orm";

export async function up(db: any) {
    await db.execute(sql`
        CREATE TABLE products (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            name VARCHAR(255) NOT NULL,
            price DECIMAL(10, 2) NOT NULL,
            created_at TIMESTAMP DEFAULT NOW()
        );
    `);
}

export async function down(db: any) {
    await db.execute(sql`DROP TABLE IF EXISTS products;`);
}
```

## Environment Variables

```env
# Application
NODE_ENV=development
APP_NAME="Nyala MVC App"
APP_URL=http://localhost:3000

# Server
HOST=0.0.0.0
PORT=3000

# Database
DB_DRIVER=postgres
DB_HOST=localhost
DB_PORT=5432
DB_NAME=nyala_mvc
DB_USER=postgres
DB_PASSWORD=

# Authentication
JWT_SECRET=your-secret-key-change-in-production
JWT_EXPIRES_IN=1h
JWT_REFRESH_EXPIRES_IN=7d

# Logging
LOG_LEVEL=info

# CORS
CORS_ORIGIN=*
CORS_CREDENTIALS=true

# Rate Limiting
RATE_LIMIT_MAX=100
RATE_LIMIT_WINDOW_MS=60000
```

## Docker

Start with Docker Compose:

```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f app

# Stop services
docker-compose down
```

Build and run production image:

```bash
# Build
docker build -t nyala-mvc .

# Run
docker run -p 3000:3000 --env-file .env nyala-mvc
```

## Best Practices

1. **Keep Controllers Thin** - Move business logic to services
2. **Use Repositories** - Abstract database queries
3. **Validate Requests** - Always validate incoming data
4. **Use DTOs** - Type-safe data transfer objects
5. **Resource Transformers** - Consistent API responses
6. **Error Handling** - Use custom exceptions
7. **Logging** - Log important events and errors
8. **Testing** - Write tests for critical functionality
9. **Environment Config** - Never hardcode sensitive values
10. **Documentation** - Keep API docs up to date

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## License

MIT

## Support

- [Documentation](https://nyalajs.dev)
- [Discord Community](https://discord.gg/nyalajs)
- [GitHub Issues](https://github.com/nyalajs/nyala/issues)

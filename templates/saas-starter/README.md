<div align="center">

<img src="./assets/logo.png" alt="Nyala Framework" width="200" />

# SaaS Starter Template

</div>

Production-ready multi-tenant SaaS application built with Nyala Framework.

## Features

✅ **Multi-Tenancy** - Built-in tenant isolation with subdomain/header/JWT resolution
✅ **Authentication** - JWT-based auth with refresh tokens
✅ **Authorization** - Role-based and policy-based access control
✅ **Audit Logging** - Automatic audit trail for compliance
✅ **Observability** - Structured logging, metrics, and health checks
✅ **Security** - Secure defaults with helmet, CORS, rate limiting
✅ **Configuration** - Environment-based configuration with 13 config namespaces
✅ **Database** - Drizzle ORM with migrations, seeders, and factories
✅ **Validation** - Zod-based request validation
✅ **CLI Integration** - Generate controllers, services, models, and more

## Quick Start

```bash
# Install dependencies
npm install

# Setup environment
cp .env.example .env
# Edit .env with your configuration

# Run database migrations
npm run db:migrate

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
├── controllers/        # HTTP route controllers
│   ├── auth.controller.ts
│   ├── health.controller.ts
│   └── users.controller.ts
├── services/           # Business logic
│   ├── auth.service.ts
│   └── users.service.ts
├── middleware/         # Custom middleware
│   └── logging.middleware.ts
├── models/             # Request DTOs/validation
├── events/             # Domain events
├── listeners/          # Event listeners
├── jobs/               # Background jobs
└── ...                 # (resources, exceptions, etc.)
bootstrap/
├── app.module.ts       # Root module (auto-wired)
└── main.ts             # Entry point
config/                 # Configuration files
├── app.ts
├── auth.ts
├── database.ts
├── mail.ts
└── ...
├── database.ts
├── mail.ts
└── ...                 # (13 config files total)
database/
├── migrations/         # Database migrations
│   └── 0001_initial.ts
├── seeders/            # Seed data
├── factories/          # Test factories
└── schema/             # Drizzle ORM schema
routes/
└── api.ts              # Route definitions
.env                    # Environment variables
.env.example            # Environment template
Dockerfile              # Production container
docker-compose.yml      # Local development
k8s/                    # Kubernetes manifests
└── deployment.yaml
```

## API Endpoints

### Health Checks
- `GET /health/live` - Liveness probe
- `GET /health/ready` - Readiness probe
- `GET /metrics` - Prometheus metrics

### Authentication
- `POST /auth/register` - Register new user
- `POST /auth/login` - Login
- `POST /auth/refresh` - Refresh access token
- `GET /auth/me` - Get current user
- `POST /auth/logout` - Logout

### Users (Protected)
- `GET /users` - List users (admin/superadmin only, tenant-scoped)
- `GET /users/:id` - Get user (own profile or admin)
- `POST /users` - Create user (admin/superadmin only)
- `PUT /users/:id` - Update user (own profile or admin)
- `DELETE /users/:id` - Delete user (admin/superadmin only)

## Generating New Code

Use the Nyala CLI to generate new components:

```bash
# Generate a new controller
nyala generate controller products

# Generate a new service
nyala generate service orders

# Generate a new model
nyala generate model product

# Generate a database migration
nyala generate migration add_products_table

# Generate middleware
nyala generate middleware rate-limiter

# Generate authorization policy
nyala generate policy product-owner

# Generate event and listener
nyala generate event order-placed
nyala generate listener send-order-confirmation

# Generate background job
nyala generate job process-payment

# Generate API resource transformer
nyala generate resource product
```

All generated files are automatically placed in the correct `app/` subdirectory and wired into `bootstrap/app.module.ts`.

## Testing

```bash
# Run unit tests
npm test

# Run integration tests
npm run test:e2e

# Run with coverage
npm run test:coverage
```

## Deployment

### Docker

```bash
# Build image
docker build -t saas-app .

# Run container
docker run -p 3000:3000 --env-file .env saas-app
```

### Kubernetes

```bash
# Apply manifests
kubectl apply -f k8s/

# Check status
kubectl get pods
```

## Security Best Practices

1. **Change JWT_SECRET** in production
2. **Use HTTPS** in production
3. **Enable rate limiting** for public endpoints
4. **Implement CSRF protection** for state-changing operations
5. **Regular security audits** of dependencies
6. **Rotate credentials** regularly
7. **Monitor audit logs** for suspicious activity

## Database Migrations

```bash
# Run pending migrations
npm run db:migrate

# Drop all tables and re-run migrations
npm run db:fresh

# Drop all tables, re-run migrations, and seed
npm run db:fresh --seed

# Run seeders
npm run db:seed
```

## Configuration

All configuration is managed through environment variables and the `config/` directory:

- `config/app.ts` - Application settings (name, version, environment)
- `config/server.ts` - HTTP server settings (port, host)
- `config/database.ts` - Database connection settings
- `config/auth.ts` - JWT secrets and token expiration
- `config/cache.ts` - Redis cache settings
- `config/queue.ts` - Job queue settings
- `config/mail.ts` - Email service settings
- `config/storage.ts` - File storage settings
- `config/logging.ts` - Logging configuration
- `config/cors.ts` - CORS settings
- `config/security.ts` - Security headers and policies
- `config/session.ts` - Session management
- `config/plugins.ts` - Plugin configuration

Each config file reads from environment variables with sensible defaults.

## License

MIT

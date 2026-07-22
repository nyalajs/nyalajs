# Quick Start Guide

Get Nyala running in 2 minutes.

## Installation

```bash
# Install globally
npm install -g @nyalajs/cli

# Verify
nyala --version
```

## Create Project

```bash
# Interactive - choose template
nyala new my-app

# Or specify template
nyala new my-app --template=basic-starter
```

## Setup

```bash
cd my-app
npm install
cp .env.example .env
```

## Configure Database

Edit `.env`:

```env
DB_HOST=localhost
DB_NAME=myapp
DB_USER=postgres
DB_PASSWORD=
JWT_SECRET=your-secret-key-here
```

## Run Migrations

```bash
npm run db:migrate
npm run db:seed
```

## Start Development

```bash
npm run dev
```

Visit [http://localhost:3000/health](http://localhost:3000/health)

## Test API

```bash
# Register
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"John","email":"john@example.com","password":"Password123"}'

# Login
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"john@example.com","password":"Password123"}'
```

## Next Steps

- [Full Quick Start Tutorial](./docs/quick-start.md) - Build your first feature
- [Core Concepts](./docs/core-concepts.md) - Understand the architecture
- [Documentation](./docs/index.md) - Complete guides

## Templates

### Basic Starter (Recommended)
```bash
nyala new my-app --template=basic-starter
```
- Authentication included
- User management
- Database setup
- Docker ready
- Request validation

### SaaS Starter
```bash
nyala new my-saas --template=saas-starter
```
- Everything from Basic Starter
- Multi-tenancy with data isolation
- Tenant management
- Cross-tenant protection
- Enterprise features

## Common Commands

```bash
# Generate components
nyala generate controller Products
nyala generate service Orders
nyala generate model Product

# Database
npm run db:migrate
npm run db:seed
npm run db:fresh

# Development
npm run dev
npm run build
npm test
```

## Available Packages

All packages are published on npm under [@nyalajs](https://www.npmjs.com/org/nyalajs):

- `@nyalajs/cli` - Command-line interface
- `@nyalajs/core` - Framework core
- `@nyalajs/http` - HTTP server
- `@nyalajs/database` - ORM and migrations
- `@nyalajs/validation` - Request validation
- `@nyalajs/security` - Authentication
- `@nyalajs/tenancy` - Multi-tenant support
- And more...

[View all packages →](https://www.npmjs.com/org/nyalajs)

## Get Help

- [Documentation](./docs/index.md)
- [GitHub Repository](https://github.com/nyalajs/nyalajs)
- [GitHub Issues](https://github.com/nyalajs/nyalajs/issues)
- [NPM Packages](https://www.npmjs.com/org/nyalajs)

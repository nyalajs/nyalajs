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
nyala new my-app --template=mvc
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
- [Architecture Guide](./docs/architecture.md) - Understand the structure
- [Documentation](./docs/index.md) - Complete guides

## Templates

### MVC Starter (Recommended)
```bash
nyala new my-app --template=mvc
```
- Authentication included
- User management
- Database setup
- Docker ready

### SaaS Starter
```bash
nyala new my-saas --template=saas
```
- Everything from MVC
- Multi-tenancy
- Tenant isolation
- Enterprise features

### Basic
```bash
nyala new my-app --template=basic
```
- Minimal setup
- Custom projects

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

## Get Help

- [Documentation](./docs/index.md)
- [GitHub Issues](https://github.com/nyalajs/nyala/issues)
- [Discord](https://discord.gg/nyalajs)

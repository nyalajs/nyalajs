# Installation

## Requirements

- Node.js 18+
- npm or yarn
- PostgreSQL (for database features)

## Quick Install

Install the Nyala CLI globally:

```bash
npm install -g @nyala/cli
```

Verify installation:

```bash
nyala --version
```

## Create Your First Project

Use the CLI to create a new project:

```bash
# Interactive mode (recommended)
nyala new my-app

# Or specify template
nyala new my-app --template=mvc
```

Available templates:
- `mvc` - Full MVC application with authentication (recommended)
- `saas` - Multi-tenant SaaS application
- `basic` - Minimal setup for custom projects

## Project Setup

Navigate to your project and install dependencies:

```bash
cd my-app
npm install
```

Configure your environment:

```bash
cp .env.example .env
```

Edit `.env` with your settings:

```env
# Application
PORT=3000
NODE_ENV=development

# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=myapp
DB_USER=postgres
DB_PASSWORD=

# Authentication
JWT_SECRET=your-secret-key-here
```

## Database Setup

Run migrations to create tables:

```bash
npm run db:migrate
```

(Optional) Seed with sample data:

```bash
npm run db:seed
```

## Start Development Server

```bash
npm run dev
```

Your application is now running at [http://localhost:3000](http://localhost:3000)

Test the health endpoint:

```bash
curl http://localhost:3000/health
```

## Next Steps

- [Quick Start](./quick-start.md) - Build your first feature
- [Architecture](./architecture.md) - Understand the structure
- [CLI Commands](./cli-commands.md) - Available commands

## Troubleshooting

### Port Already in Use

Change the `PORT` in your `.env` file or kill the process:

```bash
lsof -ti:3000 | xargs kill -9
```

### Database Connection Error

Ensure PostgreSQL is running:

```bash
# Using Docker
docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=postgres postgres

# Or check your local PostgreSQL service
```

### Module Not Found

Clear and reinstall dependencies:

```bash
rm -rf node_modules package-lock.json
npm install
```

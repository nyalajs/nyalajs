# Installation

## System Requirements

Before installing Nyala, ensure your system meets these requirements:

- **Node.js** 18.0 or higher
- **npm** 9.0 or higher (or yarn 1.22+)
- **PostgreSQL** 14+ (for database features)
- **TypeScript** 5.0+ (installed automatically)

## Installing the CLI

Install the Nyala CLI globally using npm:

```bash
npm install -g @nyalajs/cli
```

Or with yarn:

```bash
yarn global add @nyalajs/cli
```

Verify the installation:

```bash
nyala --version
```

## Creating a New Project

### Interactive Mode (Recommended)

The CLI will guide you through project creation:

```bash
nyala new my-app
```

You'll be prompted to choose:
- **Project name** (if not passed as an argument)
- **Template**: mvc, saas, cms, inertia, or basic
- **Database driver**: postgres, mysql, or sqlite

There's no package-manager prompt — `nyala new` doesn't run an install step or ask which package manager to use; run `npm install` (or your package manager of choice) yourself after the project is created.

### Direct Creation

Specify options directly:

```bash
nyala new my-app --template=mvc --database=postgres
```

Available options:

| Option | Values | Default |
|--------|--------|---------|
| `--template` | mvc, saas, cms, inertia, basic | mvc |
| `--database` | postgres, mysql, sqlite | postgres |

`--database` only feeds the interactive prompt flow — it doesn't change which files get copied for any starter template. `inertia` in particular always ships on SQLite (`better-sqlite3`) regardless of this flag; there's no Postgres/MySQL variant of it.
| `--skip-install` | - | false |

## Template Options

### MVC Starter

Complete application with authentication and user management:

```bash
nyala new my-app --template=mvc
```

**Includes:**
- JWT authentication (register, login, refresh, logout)
- User CRUD operations with validation
- Database migrations and seeders
- Docker and docker-compose setup
- Complete documentation
- Health check endpoints

**Best for:** Standard web applications, APIs, admin panels

### SaaS Starter

Multi-tenant application with automatic data isolation:

```bash
nyala new my-saas --template=saas
```

**Includes:**
- Everything from MVC template
- Multi-tenancy with automatic tenant scoping
- Tenant management (create, update, delete)
- Cross-tenant protection
- Tenant-specific user management
- Role-based access control

**Best for:** SaaS applications, B2B platforms, multi-customer systems

### CMS Starter

Full-stack website starter: an admin dashboard, a CMS (pages, blog, media, menus, forms), and the public-facing site — all one app, server-rendered by default:

```bash
nyala new my-site --template=cms
```

**Includes:**
- Admin dashboard (pages, posts, categories, tags, media, menus, forms, users)
- Server-rendered public site (blog, pages) built on `@nyalajs/react`
- Session-based authentication
- Interactive islands for a couple of screens (media upload, menu reordering)
- Database migrations and seeders

**Best for:** Marketing sites, blogs, and small content-driven sites that need an admin dashboard

### Inertia Starter

A React frontend and a Nyala backend in one app, talking over the real [Inertia.js](https://inertiajs.com) protocol — no separate REST/GraphQL API, no client-side router:

```bash
nyala new my-app --template=inertia
```

**Includes:**
- Session-based authentication (register, login, logout)
- A shadcn/ui admin dashboard (`resources/js/layouts/admin-layout.tsx`) — responsive sidebar + topbar shell for the Dashboard, Posts, and Settings pages
- Posts CRUD, a stats dashboard, and account settings (name, password) — all real, working pages, not stubs
- A public Welcome landing page
- SQLite by default, no Docker/Postgres setup needed

See [CLI → Templates](./cli/templates#inertia-starter-template-inertia) for the full directory listing and file-by-file breakdown.

**Best for:** Internal tools and CRUD-heavy apps that want a full client-side React UI without standing up a separate API

### Basic

Minimal setup for custom projects — no starter template is copied, just the bare `app/<type>/` folder convention:

```bash
nyala new my-app --template=basic
```

**Includes:**
- Empty `app/<type>/` folders for every artifact type (controllers, models, services, repositories, and more), each with a `.gitkeep`
- `config/`, `bootstrap/app.module.ts` + `main.ts`, `routes/api.ts`
- `.env` / `.env.example`, `package.json`, `tsconfig.json`

**Best for:** Custom projects, microservices, learning

## Project Setup

Navigate to your project:

```bash
cd my-app
```

If you skipped installation, install dependencies:

```bash
npm install
```

## Environment Configuration

Copy the example environment file:

```bash
cp .env.example .env
```

Edit `.env` with your configuration:

```env
# Application
PORT=3000
NODE_ENV=development
APP_URL=http://localhost:3000

# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=nyala_app
DB_USER=postgres
DB_PASSWORD=your_password

# Authentication (JWT)
JWT_SECRET=your-super-secret-jwt-key-change-this
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# Multi-Tenancy (SaaS template only)
TENANT_HEADER=X-Tenant-ID
```

## Database Setup

### Using Docker (Recommended)

Start PostgreSQL with Docker:

```bash
docker-compose up -d
```

The database will be available at `localhost:5432`.

### Local PostgreSQL

Create a new database:

```sql
CREATE DATABASE nyala_app;
```

### Run Migrations

Create database tables:

```bash
npm run db:migrate
```

Seed with sample data (optional):

```bash
npm run db:seed
```

## Start Development Server

Start the development server with hot reload:

```bash
npm run dev
```

Your application is now running at [http://localhost:3000](http://localhost:3000)

### Test the Application

Check the health endpoint:

```bash
curl http://localhost:3000/health
```

Response:

```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "uptime": 15.234,
  "environment": "development"
}
```

### Test Authentication (MVC/SaaS templates)

Register a new user:

```bash
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "Password123!",
    "name": "John Doe"
  }'
```

## Building for Production

Build the application:

```bash
npm run build
```

Start the production server:

```bash
npm start
```

## Next Steps

<div class="next-grid">

**[Quick Start →](./quick-start)**
Build your first feature

**[Project Structure →](./concepts/structure)**
Understand the file organization

**[Configuration →](./configuration)**
Learn about configuration options

**[CLI Commands →](./cli/commands)**
Explore available commands

</div>

## Troubleshooting

### Port Already in Use

If port 3000 is taken, change it in `.env`:

```env
PORT=3001
```

Or kill the process using the port:

```bash
# Find process
lsof -ti:3000

# Kill process
kill -9 $(lsof -ti:3000)
```

### Database Connection Error

**Check PostgreSQL is running:**

```bash
# Docker
docker ps | grep postgres

# Local (macOS)
brew services list | grep postgresql

# Local (Linux)
systemctl status postgresql
```

**Verify connection details:**

```bash
psql -h localhost -U postgres -d nyala_app
```

### Module Not Found Errors

Clear and reinstall dependencies:

```bash
rm -rf node_modules package-lock.json
npm install
```

### Permission Denied (Global Install)

Use sudo (Linux/macOS):

```bash
sudo npm install -g @nyalajs/cli
```

Or configure npm to install globally without sudo:

```bash
mkdir ~/.npm-global
npm config set prefix '~/.npm-global'
export PATH=~/.npm-global/bin:$PATH
```

### TypeScript Compilation Errors

Ensure TypeScript version matches:

```bash
npm install -D typescript@^5.0.0
```

## Getting Help

- **[GitHub Issues](https://github.com/nyalajs/nyala/issues)** - Bug reports and feature requests
- **[Discord Community](https://discord.gg/nyalajs)** - Real-time help and discussion
- **[Stack Overflow](https://stackoverflow.com/questions/tagged/nyala)** - Tag your questions with `nyala`

<style>
.next-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1rem;
  margin: 2rem 0;
}

.next-grid a {
  display: block;
  padding: 1rem;
  border: 1px solid var(--vp-c-divider);
  border-radius: 4px;
  text-decoration: none;
  transition: all 0.2s;
}

.next-grid a:hover {
  border-color: var(--vp-c-brand);
}

.next-grid strong {
  color: var(--vp-c-brand);
}
</style>

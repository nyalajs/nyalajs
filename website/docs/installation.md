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
- **Template**: mvc, saas, or basic
- **Database**: postgresql, mysql, or sqlite
- **Package manager**: npm or yarn

### Direct Creation

Specify options directly:

```bash
nyala new my-app --template=mvc --database=postgresql
```

Available options:

| Option | Values | Default |
|--------|--------|---------|
| `--template` | mvc, saas, basic | mvc |
| `--database` | postgresql, mysql, sqlite | postgresql |
| `--package-manager` | npm, yarn | npm |
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

### Basic

Minimal setup for custom projects:

```bash
nyala new my-app --template=basic
```

**Includes:**
- Core framework structure
- Basic routing setup
- Database connection
- Docker configuration
- Minimal dependencies

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

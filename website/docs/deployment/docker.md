# Docker

Two of the three official starters ship Docker support today:

| Template | `Dockerfile` | `docker-compose.yml` |
|----------|:---:|:---:|
| `basic-starter` | ✅ | ✅ (app + Postgres) |
| `saas-starter` | ✅ | ❌ (not included yet, see below) |
| `cms-starter` | ❌ (not added yet) | ❌ |

This page documents exactly what's in the templates' `Dockerfile`s and `docker-compose.yml` — not a generic Docker tutorial.

## Building the Image (basic-starter)

`templates/basic-starter/Dockerfile` is a two-stage build on `node:18-alpine`:

```dockerfile
# Build stage
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source code
COPY . .

# Build application
RUN npm run build

# Production stage
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --only=production

# Copy built application from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/.env.example ./.env.example

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    chown -R nodejs:nodejs /app

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

# Start application
CMD ["node", "dist/bootstrap/main.js"]
```

A few things worth calling out because they're easy to get wrong when copying this into your own app:

- **`npm ci --only=production` runs in the builder stage too.** The build stage installs *production* dependencies, then runs `npm run build` (`tsc`, per `package.json`). This only works because the framework packages compile with `tsc` and don't need devDependencies like `typescript` at build time being separately installed — if you add a build step that needs a devDependency, you'll need to adjust this.
- **The final image only contains `dist/`.** Source TypeScript never ships. `COPY --from=builder /app/dist ./dist` is the only application code copied into the runtime stage.
- **`.env.example` is copied, `.env` is not.** The image intentionally does not bake in a real `.env` file — you supply configuration at `docker run` / `docker-compose` / Kubernetes time via environment variables (see [Environment Variables](./environment)).
- **Runs as a non-root `nodejs` user** (uid/gid 1001), created explicitly in the image rather than relying on a base-image user.
- **`EXPOSE 3000`** matches the framework's default `PORT` (see [Environment Variables](./environment)). If you change `PORT`, update the `EXPOSE` line and republish the image.
- **`HEALTHCHECK` hits `GET /health`** using plain Node (`http.get`), so the image has no dependency on `curl` or `wget` being present in `node:18-alpine`. This targets the basic-starter's hand-rolled `/health` route in `app/controllers/home.controller.ts` — see [Monitoring](./monitoring) for exactly what that endpoint returns and how it differs from the versioned `@nyalajs/observability` health routes used in `saas-starter`.
- **Entry point is `node dist/bootstrap/main.js`**, i.e. the compiled `bootstrap/main.ts`.

Build it with the npm script defined in `package.json`:

```bash
npm run docker:build
# -> docker build -t nyala-mvc .
```

Or directly:

```bash
docker build -t nyala-mvc .
```

## Running the Container

Since the image doesn't embed a `.env` file, pass configuration at run time:

```bash
docker run -d \
  --name nyala-app \
  -p 3000:3000 \
  -e NODE_ENV=production \
  -e DB_HOST=your-db-host \
  -e DB_PORT=5432 \
  -e DB_NAME=nyala_mvc \
  -e DB_USER=postgres \
  -e DB_PASSWORD=your-db-password \
  -e JWT_SECRET=$(openssl rand -base64 32) \
  nyala-mvc
```

Check the container's own health check status (Docker runs the `HEALTHCHECK` instruction automatically):

```bash
docker inspect --format='{{json .State.Health}}' nyala-app
```

Or hit the endpoint directly:

```bash
curl http://localhost:3000/health
```

## Docker Compose (basic-starter, development)

`templates/basic-starter/docker-compose.yml` runs the app alongside Postgres for local development — it is **not** a production compose file (it mounts source, runs `npm run dev`, and uses hardcoded dev credentials):

```yaml
version: '3.8'

services:
  app:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: nyala-mvc-app
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=development
      - DB_HOST=postgres
      - DB_PORT=5432
      - DB_NAME=nyala_mvc
      - DB_USER=postgres
      - DB_PASSWORD=postgres
      - JWT_SECRET=development-secret-key
    depends_on:
      - postgres
    volumes:
      - ./:/app
      - /app/node_modules
    command: npm run dev
    networks:
      - nyala-network

  postgres:
    image: postgres:15-alpine
    container_name: nyala-postgres
    ports:
      - "5432:5432"
    environment:
      - POSTGRES_USER=postgres
      - POSTGRES_PASSWORD=postgres
      - POSTGRES_DB=nyala_mvc
    volumes:
      - postgres-data:/var/lib/postgresql/data
    networks:
      - nyala-network
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  postgres-data:

networks:
  nyala-network:
    driver: bridge
```

Notes on what this actually does:

- The `app` service **builds from the same `Dockerfile`** described above but then overrides its `CMD` with `command: npm run dev` (`tsx watch bootstrap/main.ts`), and mounts your working directory (`./:/app`) plus an anonymous volume for `node_modules` — so it behaves like a hot-reloading dev server running inside a container, not the production `node dist/bootstrap/main.js` entry point baked into the image.
- `postgres` is `postgres:15-alpine` with a `pg_isready` health check, and `app` waits for it via `depends_on` (Compose's `depends_on` here only waits for the container to *start*, not for `pg_isready` to pass — for a stricter startup ordering you'd add `condition: service_healthy`).
- Credentials (`postgres` / `postgres`, `JWT_SECRET=development-secret-key`) are intentionally weak placeholders for local development only. Never reuse them outside your machine.

Start it:

```bash
npm run docker:up
# -> docker-compose up -d
```

Stop it:

```bash
npm run docker:down
# -> docker-compose down
```

## The SaaS Starter Image

`templates/saas-starter/Dockerfile` is also a two-stage build, but differs from the basic-starter one in several concrete ways:

```dockerfile
# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies
RUN npm ci

# Copy source
COPY app ./app
COPY bootstrap ./bootstrap
COPY config ./config
COPY database ./database
COPY routes ./routes

# Build
RUN npm run build

# Production stage
FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --only=production

# Copy built application
COPY --from=builder /app/dist ./dist

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

USER nodejs

EXPOSE 3000

CMD ["node", "dist/bootstrap/main.js"]
```

Differences from `basic-starter`'s image, as they actually exist in the repo today:

- **`node:20-alpine`**, not `node:18-alpine`.
- **The build stage runs a plain `npm ci`** (full dependency set, including dev dependencies), not `npm ci --only=production`, since `tsc` and other build tooling need to be present.
- **Source is copied explicitly by directory** (`app`, `bootstrap`, `config`, `database`, `routes`) rather than `COPY . .` — if you add a new top-level source directory to a saas-starter project, you must add a corresponding `COPY` line here or it won't be built into the image.
- **No `HEALTHCHECK` instruction.** The image itself has no built-in container health check — health is expected to be checked externally (e.g. by a Kubernetes probe hitting the app's HTTP health routes; see [Kubernetes](./kubernetes) and [Monitoring](./monitoring)).
- **`.env.example` is not copied** into the final image at all (basic-starter's is).
- Same non-root `nodejs` user pattern, same `EXPOSE 3000`, same `CMD ["node", "dist/bootstrap/main.js"]` entry point.

Build it with the npm script defined in `package.json`:

```bash
npm run docker:build
# -> docker build -t nyala-saas .
```

### No docker-compose.yml shipped (yet)

`saas-starter/package.json` defines `docker:up` / `docker:down` scripts (`docker-compose up -d` / `docker-compose down`), but as of this template **there is no `docker-compose.yml` file in `templates/saas-starter/`** — only the `Dockerfile`. Running `npm run docker:up` in a fresh `saas-starter` project will fail until you add one. If you need local Postgres/Redis for a saas-starter project, the fastest path is to adapt `basic-starter`'s `docker-compose.yml` above: point the `app` build context at your saas project, adjust the `environment` block to the variables your `config/*.ts` namespaces actually read (see [Environment Variables](./environment) — the saas starter uses `DATABASE_URL` in `.env.example` but its `config/database.ts` currently reads `DB_HOST`/`DB_PORT`/`DB_NAME`/`DB_USER`/`DB_PASSWORD`, so keep both sets in mind), and add a `redis` service if you're using the `cache` or `queue` namespaces.

## CMS Starter: No Dockerfile Yet

`templates/cms-starter/` does not currently include a `Dockerfile` or `docker-compose.yml`. If you need to containerize a `cms-starter` project today, the most direct path is to adapt `basic-starter`'s multi-stage `Dockerfile`:

1. Copy `templates/basic-starter/Dockerfile` into your `cms-starter` project root.
2. Update the `HEALTHCHECK` target — `cms-starter` does not currently define a `/health` route at all (see [Monitoring](./monitoring)), so either add a health endpoint first or drop the `HEALTHCHECK` instruction until you do.
3. Confirm `npm run build` and `CMD ["node", "dist/bootstrap/main.js"]` match your project's actual build output — `cms-starter`'s `bootstrap/main.ts` compiles the same way as the other starters.

## Why Multi-Stage Builds

Both shipped Dockerfiles use the same two-stage shape for the same reason: the **builder** stage has everything needed to compile TypeScript (source files, `tsconfig.json`, and — for saas-starter — full devDependencies), while the **production** stage starts from a clean base image and only copies the compiled `dist/` output plus production `node_modules`. This keeps:

- Source `.ts` files out of the shipped image.
- Dev tooling (`typescript`, test runners, etc.) out of the final image's `node_modules`.
- The final image's `npm ci --only=production` fast, since the lockfile is unchanged between stages.

## Pushing to a Registry

Neither template's `package.json` includes a `docker:push` script — tag and push manually once you've built the image:

```bash
docker build -t your-registry.example.com/nyala-app:1.0.0 .
docker push your-registry.example.com/nyala-app:1.0.0
```

If you plan to deploy to Kubernetes, note that `templates/saas-starter/k8s/deployment.yaml` hardcodes `image: saas-app:latest` — you'll need to update that field to your real registry path and tag before applying the manifest. See [Kubernetes](./kubernetes) for the full breakdown.

## Next Steps

- [Kubernetes](./kubernetes) — deploy the image with the manifest that ships in `saas-starter`
- [Environment Variables](./environment) — every variable your image needs at run time
- [Production Checklist](./checklist) — everything to verify before you ship

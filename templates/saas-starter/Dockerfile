# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install ALL dependencies (including dev — tsc, and later the migrate
# stage's tsx/@nyalajs/cli, both live in devDependencies)
RUN npm ci

# Copy source
COPY app ./app
COPY bootstrap ./bootstrap
COPY config ./config
COPY database ./database
COPY routes ./routes

# Build
RUN npm run build

# ---------------------------------------------------------------------------
# Production stage — runs the compiled app only. Migrations are NOT run here
# automatically: run them as a separate, one-off step (a CI/CD pipeline
# step, a Kubernetes Job, a `docker compose run --rm migrate`, etc.) BEFORE
# rolling out a new version of this image — never on every container boot,
# which would race every replica's migration attempt against every other
# replica's on every deploy/restart.
# ---------------------------------------------------------------------------
FROM node:20-alpine AS production

WORKDIR /app

COPY package*.json ./

# Install production dependencies only
RUN npm ci --omit=dev

# Copy built application
COPY --from=builder /app/dist ./dist

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

USER nodejs

EXPOSE 3000

CMD ["node", "dist/bootstrap/main.js"]

# ---------------------------------------------------------------------------
# Migrate stage — a separate target with the raw .ts migrations + the CLI's
# runtime available, for running `nyala db:migrate` as its own step/job.
# Build+run it explicitly:
#   docker build --target migrate -t nyala-saas-migrate .
#   docker run --rm --env-file .env nyala-saas-migrate
# ---------------------------------------------------------------------------
FROM node:20-alpine AS migrate

WORKDIR /app

COPY package*.json ./
COPY tsconfig.json ./
RUN npm ci

COPY app ./app
COPY database ./database
COPY config ./config

CMD ["npx", "nyala", "db:migrate"]

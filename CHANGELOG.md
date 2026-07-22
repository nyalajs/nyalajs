# Changelog

All notable changes to the Nyala Framework monorepo will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-07-21

### Added

- Initial production release of Nyala Framework
- Complete TypeScript framework for enterprise SaaS applications
- 18 core packages:
  - `@nyala/core` - Kernel, DI container, module system, decorators
  - `@nyala/http` - Fastify adapter with routing, guards, interceptors
  - `@nyala/security` - JWT authentication, RBAC, authorization
  - `@nyala/tenancy` - Multi-tenancy with automatic tenant isolation
  - `@nyala/audit` - Comprehensive audit logging
  - `@nyala/observability` - Structured logging, Prometheus metrics, health checks
  - `@nyala/config` - Environment-based configuration with validation
  - `@nyala/database` - Drizzle ORM integration
  - `@nyala/cache` - Redis-backed caching
  - `@nyala/queue` - BullMQ job queue integration
  - `@nyala/scheduler` - Cron-based task scheduling
  - `@nyala/events` - Event bus and emitters
  - `@nyala/mail` - Email service with Nodemailer
  - `@nyala/notifications` - Multi-channel notification system
  - `@nyala/storage` - Storage abstraction (local, S3)
  - `@nyala/validation` - Zod-based validation
  - `@nyala/testing` - Testing utilities
  - `@nyala/cli` - Powerful CLI with code generators
- Production-ready SaaS starter template with multi-tenancy
- Comprehensive documentation and examples

### Features

- **Native Multi-Tenancy** - Subdomain, header, and JWT-based tenant resolution
- **Security by Default** - Helmet, CORS, rate limiting, CSRF protection
- **Audit Logging** - Automatic audit trail for compliance
- **Dependency Injection** - Advanced DI with multiple scopes (singleton, request, transient)
- **Request Context** - AsyncLocalStorage-based context management
- **CLI Generators** - Generate controllers, services, models, migrations, and more
- **Zero-Config Development** - Sensible defaults with easy customization
- **Production Observability** - Structured logging, metrics, and health checks

[1.0.0]: https://github.com/nyalajs/nyala/releases/tag/v1.0.0

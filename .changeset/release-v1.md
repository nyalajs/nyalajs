---
"@nyala/cli": minor
"@nyala/core": patch
"@nyala/http": patch
"@nyala/config": patch
"@nyala/database": patch
---

# Production Release with Starter Templates

## New Features

### CLI Template System
- Add `--template` flag to `nyala new` command
- Support for mvc, saas, and basic templates
- Interactive template selection
- Smart file copying with exclusions

### MVC Starter Template
- Complete MVC architecture (Controllers, Models, Services, Repositories)
- JWT authentication system
- User management with CRUD operations
- Request validation with Zod
- Database migrations and seeders
- Password hashing utilities
- Docker and docker-compose support
-# Breaking Changes

- CLI now defaults to `mvc` template instead of `basic`
- Use `--template=basic` for minimal project setup

## Migration Guide

If you're using the old default template:
```bash
# Old behavior
nyala new my-app  # Creates basic template

# New behavior
nyala new my-app  # Creates MVC template
nyala new my-app --template=basic  # Creates basic template
```

# @nyalajs/cli

## 1.1.0

### Minor Changes

- acb2696: # Production Release with Starter Templates

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

### Patch Changes

- Fix `nyala new` (basic template) generating a `package.json` that pinned `@nyalajs/core`, `@nyalajs/http`, and `@nyalajs/config` to `^0.1.0`, a version line that was never published (the packages are published at `1.0.0`). This caused `npm install` to fail with `ETARGET`, which in turn left `ts-node` uninstalled and `npm run dev` failing with `ts-node: not found`.

  - Bump generated dependency ranges to `^1.0.0`
  - Switch the generated `dev` script from `ts-node bootstrap/main.ts` to `tsx watch bootstrap/main.ts`, matching the `basic-starter`/`saas-starter` templates

- Updated dependencies [acb2696]
  - @nyalajs/core@1.0.1

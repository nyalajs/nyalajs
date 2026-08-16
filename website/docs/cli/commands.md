# CLI Commands

Full reference for every top-level Nyala CLI command except `nyala generate`, which has its [own dedicated page](./generators) because it has many subcommands of its own.

For each command below: syntax, every flag with its actual default, and what the command does under the hood.

## `nyala new [name]`

Scaffolds a new Nyala application, either by copying a starter template or by writing a bare folder structure.

```bash
nyala new [name] [options]
```

### Options

| Flag | Values | Default |
|---|---|---|
| `-t, --template <template>` | `mvc`, `saas`, `cms`, `inertia`, `basic` | `mvc` |
| `-d, --database <driver>` | `postgres`, `mysql`, `sqlite` | `postgres` |

### Behavior

- If you omit `[name]`, the CLI prompts interactively for a project name.
- If you omit `--template`, the CLI prompts you to choose one from a list (the same five values above).
- If you omit `--database`, the CLI prompts you to choose a driver.
- If a directory matching `name` already exists in the current working directory, the command fails without touching it.
- For `mvc`, `saas`, `cms`, and `inertia`, the CLI copies the corresponding starter template (see [Templates](./templates) for exactly what that includes), excluding `node_modules`, `dist`, `.turbo`, and `.git`, then rewrites the `name` field in the copied `package.json` to match your project name.
- For `basic` (or any unrecognized `--template` value), no starter template is copied — instead the CLI writes a bare scaffold: the full `app/<type>` folder convention (controllers, models, services, repositories, middleware, requests, resources, validators, policies, events, listeners, jobs, mail, notifications, exceptions, dto, enums, interfaces, contracts, helpers — each with a `.gitkeep`), empty top-level folders (`database/migrations`, `database/seeders`, `database/factories`, `routes`, `storage`, `public`, `resources`, `tests`, `docs`, `plugins`, `framework`), a `config/` directory with 13 typed config files, `bootstrap/app.module.ts` + `bootstrap/main.ts`, `routes/api.ts`, `package.json`, `tsconfig.json`, `.env` / `.env.example`, `.gitignore`, and a `README.md`.
- `--database` is only consulted by the interactive prompt flow today — it doesn't change which files are written for any template, including the bare `basic` scaffold (the generated `config/database.ts` always reads `DB_DRIVER` from the environment at runtime). `inertia` always ships on SQLite regardless of `--database` — there's no Postgres/MySQL variant of it.

### Examples

Interactive — prompts for everything not passed on the command line:

```bash
nyala new
```

Direct creation with an MVC starter on Postgres:

```bash
nyala new blog-api --template=mvc --database=postgres
```

Direct creation with the Inertia starter (React + shadcn/ui admin dashboard, SQLite):

```bash
nyala new my-app --template=inertia
```

Bare scaffold, no starter template copied:

```bash
nyala new my-service --template=basic
```

See [Templates](./templates) for what `mvc`, `saas`, `cms`, and `inertia` actually contain.

## `nyala generate <type> <name>`

Alias: `nyala g`.

Generates a single framework artifact (controller, service, model, migration, and 12 other types) into the conventional `app/<type>/` (or `database/...`, `plugins/...`) location. This command has its own full reference: see [Generators](./generators).

```bash
nyala generate controller Post
nyala g service Post
```

## `nyala dev`

Starts the application in development mode with hot-reload.

```bash
nyala dev
```

No options.

### Behavior

1. If `app/islands/manifest.ts` exists in the project, the CLI first spawns a background island-bundling watcher (esbuild via `@nyalajs/react`'s build helper) that rebuilds island bundles into `public/` on every change. If that file doesn't exist, this step is a silent no-op — `nyala dev` behaves identically for apps that don't use islands.
2. It then runs `npx nodemon --exec ts-node bootstrap/main.ts`, restarting your app on every file change, with output streamed directly to your terminal.
3. The process exits with the same status code nodemon exits with.

## `nyala db:migrate`

Runs pending database migrations against Postgres, tracked in a `_nyala_migrations` table.

```bash
nyala db:migrate [options]
```

### Options

| Flag | Description | Default |
|---|---|---|
| `--seed` | Run seeders after migrating | off (not set) |

### Behavior

- Loads `.env` from the current working directory.
- Fails with an error if `database/migrations/` doesn't exist yet (run `nyala generate migration <name>` first) or if no database connection string can be built (see [Connection Resolution](#connection-resolution) below).
- Applies every migration file in `database/migrations/` that hasn't already been recorded in `_nyala_migrations`, in filename order, calling each file's exported `up(db)` function and recording it as applied.
- Migration files are the stubs written by `nyala generate migration <name>` — see [Generators](./generators#nyala-generate-migration-name).
- If `--seed` is passed, runs every file in `database/seeders/` after migrating completes successfully.

### Example

```bash
nyala db:migrate
nyala db:migrate --seed
```

Typically invoked via the npm script every starter template wires up:

```bash
npm run db:migrate
```

## `nyala db:rollback`

Rolls back the single most recently applied migration.

```bash
nyala db:rollback
```

No options.

### Behavior

- Loads `.env`, resolves the connection string the same way as `db:migrate`.
- Looks up the most recent row in `_nyala_migrations` (ordered by insertion), calls that migration file's exported `down(db)` function, then deletes its tracking row.
- If no migrations have been applied, it logs `No migrations to roll back.` and exits cleanly — this is a single-step rollback, not a rollback-to-batch or rollback-all.

### Example

```bash
nyala db:rollback
```

## `nyala db:fresh`

Drops the entire `public` schema, recreates it, and re-runs every migration from scratch.

```bash
nyala db:fresh [options]
```

### Options

| Flag | Description | Default |
|---|---|---|
| `--seed` | Run seeders after migrating | off (not set) |

::: warning
This is destructive: `DROP SCHEMA public CASCADE` removes every table, not just the ones your migrations created. Only run this against a development or test database.
:::

### Behavior

- Loads `.env`, resolves the connection string, requires the `pg` package to be installed in your project (`npm install pg` if it isn't).
- Runs `DROP SCHEMA public CASCADE; CREATE SCHEMA public;` directly, then re-runs the full `db:migrate` flow (every file in `database/migrations/`, in order).

::: tip
`--seed` is accepted by the CLI parser but isn't currently forwarded to the migration step, so it has no effect on `db:fresh` — run `nyala db:seed` as a separate step afterward if you need sample data.
:::

### Example

```bash
nyala db:fresh
nyala db:seed   # separately, if you need seed data
```

## `nyala db:seed`

Runs database seeders from `database/seeders/`.

```bash
nyala db:seed [options]
```

### Options

| Flag | Description | Default |
|---|---|---|
| `--class <name>` | Only run seeder file(s) whose filename contains `<name>` (case-insensitive substring match) | unset — runs every seeder |

### Behavior

- Loads `.env`, resolves the connection string, requires `pg` and `drizzle-orm` to be installed.
- Fails with an error if `database/seeders/` doesn't exist (run `nyala generate seeder <Name>` first) or if no connection string can be resolved.
- Collects every `.ts`/`.js` file in `database/seeders/`, sorted alphabetically. If `--class` is given, filters to files whose name contains that string (case-insensitive); if nothing matches, it fails.
- For each matching file, imports it, resolves the exported class (`default` export, or the first exported function-typed value), instantiates it, and calls `.run(db)` on it. Files without a usable class or a `run()` method are skipped with a warning rather than failing the whole run.

### Examples

Run every seeder:

```bash
nyala db:seed
```

Run only seeders whose filename contains "user" (matches e.g. `user.seeder.ts`, `01-admin-user.seeder.ts`):

```bash
nyala db:seed --class user
```

## `nyala build`

Compiles the application for production.

```bash
nyala build [options]
```

### Options

| Flag | Description | Default |
|---|---|---|
| `--out-dir <dir>` | Output directory for compiled JS | `dist` |

### Behavior

1. Runs `npx tsc --outDir <out-dir> --skipLibCheck`, streaming output to your terminal. If `tsc` exits non-zero, `nyala build` exits with the same code and does not proceed further.
2. On success, prints `✔ Build complete → <out-dir>/`.
3. Bundles islands into `public/` the same way `nyala dev` does (a no-op if `app/islands/manifest.ts` doesn't exist) — this step always targets `public/`, independent of `--out-dir`.

### Examples

```bash
nyala build
nyala build --out-dir build
```

Typically invoked via:

```bash
npm run build
```

## `nyala validate`

Validates application architecture against a small set of structural rules.

```bash
nyala validate
```

No options.

### Behavior

Scans every `.ts` file under `app/`, `bootstrap/`, `config/`, `routes/`, and `database/` (skipping `node_modules` and `dist`) and checks for:

- **Deep relative imports** — any import line containing more than two `../` segments is flagged (e.g. `import { X } from "../../../shared/x"`), on the theory that a relative import reaching that far up usually means a module boundary was crossed incorrectly.

Circular-dependency detection is present in the command's structure but is currently a stub that always reports no violations.

If any violations are found, they're printed one per line (`file:line - Deep import detected (depth: N)`) and the command exits with status `1`. Otherwise it prints `✓ No architecture violations found` and exits `0` — safe to wire into CI.

### Example

```bash
nyala validate
```

## Connection Resolution

`db:migrate`, `db:rollback`, `db:fresh`, and `db:seed` all resolve a Postgres connection string the same way, in this order:

1. `DB_URL` environment variable, used as-is if set.
2. `DATABASE_URL` environment variable, used as-is if set.
3. Built from `DB_HOST` + `DB_NAME` + `DB_USER` (required), plus optional `DB_PORT` (defaults to `5432`) and `DB_PASSWORD`, into `postgresql://<user>:<password>@<host>:<port>/<database>`.

If none of these resolve, the command fails with an explanatory error rather than attempting a connection. All four commands call `dotenv.config()` against `.env` in the current working directory first, so values in `.env` are picked up automatically — you don't need to `export` them yourself.

```env
# .env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=blog_api
DB_USER=postgres
DB_PASSWORD=your_password
```

## See Also

- [Generators](./generators) — the full `nyala generate <type>` reference
- [Templates](./templates) — what `--template=mvc|saas|cms|inertia` each scaffold
- [Installation](../installation) — first-time setup walkthrough

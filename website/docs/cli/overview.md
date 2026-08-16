# CLI Overview

The Nyala CLI (`@nyalajs/cli`) is the primary tool for scaffolding, developing, and building Nyala applications. It creates new projects from starter templates, generates framework artifacts (controllers, services, models, and more) into your app's conventional folder structure, runs database migrations and seeders, starts a hot-reloading dev server, and builds your application for production.

Every command begins with the `nyala` binary. Internally the CLI is built on [Commander](https://github.com/tj/commander.js), so standard conventions apply: `nyala <command> --help` prints usage for any command, and `nyala --version` prints the installed CLI version.

## System Requirements

- **Node.js** 18.0 or higher
- **npm** 9.0 or higher (or yarn)
- **PostgreSQL** 14+ if you plan to use `db:migrate`, `db:rollback`, `db:fresh`, or `db:seed` — they connect over `pg`

See the [Installation Guide](../installation) for the complete project setup walkthrough, including environment configuration and database setup.

## Installation

Install the CLI globally with npm:

```bash
npm install -g @nyalajs/cli
```

Or with yarn:

```bash
yarn global add @nyalajs/cli
```

Verify it's on your `PATH`:

```bash
nyala --version
```

You don't have to install it globally — `npx @nyalajs/cli new my-app` works too, and every generated project also adds `@nyalajs/cli` as a local `devDependency`, so `nyala generate ...` and the `db:*` commands work from an npm script (e.g. `npm run db:migrate`) without a global install at all.

If you haven't created a project yet, see the [Installation Guide](../installation) for the full setup walkthrough, or jump straight to [Templates](./templates) to pick a starter.

## Commands at a Glance

| Command | Description |
|---|---|
| [`nyala new [name]`](./commands#nyala-new-name) | Scaffold a new Nyala application from a starter template |
| [`nyala generate <type> <name>`](./generators) (alias `g`) | Generate a framework artifact (controller, service, model, migration, etc.) |
| [`nyala dev`](./commands#nyala-dev) | Start the app in development mode with hot-reload |
| [`nyala db:migrate`](./commands#nyala-db-migrate) | Run pending database migrations |
| [`nyala db:rollback`](./commands#nyala-db-rollback) | Roll back the most recently applied migration |
| [`nyala db:fresh`](./commands#nyala-db-fresh) | Drop the schema, re-run all migrations, optionally seed |
| [`nyala db:seed`](./commands#nyala-db-seed) | Run database seeders from `database/seeders/` |
| [`nyala build`](./commands#nyala-build) | Compile the application for production |
| [`nyala validate`](./commands#nyala-validate) | Validate application architecture |

Every invocation prints a small banner (the Nyala logo plus the installed version) before running the requested command — this is cosmetic and doesn't affect scripting; command output still goes to stdout/stderr as usual.

## What Each Command Actually Does

A slightly deeper pass than the table above — full detail lives on the [Commands](./commands) and [Generators](./generators) pages.

- **`new`** either copies one of four starter templates (`mvc`, `saas`, `cms`, `inertia` — see [Templates](./templates)) into a new directory, or, for `--template=basic`, writes a bare `app/<type>/` folder scaffold with no starter code. It can run fully interactively (prompting for name, template, and database) or take everything as flags.
- **`generate`** (alias `g`) writes one artifact — a controller, model, migration, service, repository, request, policy, middleware, event, listener, job, resource, plugin, seeder, or factory — into the matching `app/<type>/` (or `database/...`, `plugins/...`) folder of the *current* project. It has 15 subcommands, one per artifact type; see [Generators](./generators) for the full list.
- **`dev`** bundles any registered islands (no-op if your app doesn't use `@nyalajs/react` islands), runs a real Vite dev server alongside it if the project has a `vite.config.ts` (the `inertia` template does), then runs your app under `nodemon` + `ts-node` so it restarts on file changes.
- **`db:migrate`** / **`db:rollback`** / **`db:fresh`** / **`db:seed`** all operate against Postgres, resolving connection details from `.env` in the current directory (`DB_URL`, `DATABASE_URL`, or discrete `DB_HOST`/`DB_PORT`/`DB_NAME`/`DB_USER`/`DB_PASSWORD` variables). The `inertia` template doesn't use these — it's SQLite-only, so its `package.json` points `db:migrate`/`db:seed` at its own `database/migrate.ts`/`seed.ts` scripts instead.
- **`build`** runs `tsc` to compile your app to `dist/` (or a custom `--out-dir`), then bundles islands into `public/` if present, or runs `vite build` if the project has a `vite.config.ts`.
- **`validate`** scans `app/`, `bootstrap/`, `config/`, `routes/`, and `database/` for overly-deep relative imports (more than two `../` segments) as a lightweight architecture check, suitable for CI.

## Where Commands Run From

Every command except `new` operates on the **current working directory** — `generate`, `dev`, `build`, `validate`, and all four `db:*` commands assume you're standing inside a Nyala project (they look for `app/`, `bootstrap/app.module.ts`, `database/migrations/`, etc. relative to `process.cwd()`). `cd` into your project directory first:

```bash
cd my-app
nyala generate controller Post
nyala db:migrate
```

`new` is the exception — it runs from the directory *above* where you want the project created, and creates `<name>/` inside it.

## The `app/` Convention

Every command that scaffolds or generates code shares one convention: application code lives under `app/`, one subfolder per artifact type. `nyala new` creates all twenty of these folders up front (populated with starter code for `mvc`/`saas`/`cms`/`inertia`, or just a `.gitkeep` for `--template=basic`):

```
app/controllers   app/models        app/services      app/repositories
app/middleware    app/requests      app/resources     app/validators
app/policies      app/events        app/listeners     app/jobs
app/mail          app/notifications app/exceptions    app/dto
app/enums         app/interfaces    app/contracts     app/helpers
```

`nyala generate <type> <name>` (see [Generators](./generators)) writes into whichever of these folders matches `<type>` — `nyala generate controller Post` always goes to `app/controllers/`, regardless of which starter template you began from. This is also why `nyala generate` works identically across the `mvc`, `saas`, `cms`, and `inertia` templates: they all share this same folder shape for backend code, they just start with different files already in place. `inertia` is the one exception on the frontend side — its React pages live in `resources/js/pages/`, outside the `app/<type>/` convention entirely, and `nyala generate` doesn't scaffold those.

Framework composition happens in `bootstrap/`: `app.module.ts` is the app's single `@Module({...})` declaration (controllers, providers), and `main.ts` is the entry point that boots it. The `controller` and `service` generators edit `bootstrap/app.module.ts` for you automatically — see [Generators → Auto-Registration](./generators#auto-registration).

## A Typical Session

Scaffold a project, install dependencies, migrate the database, and start developing:

```bash
nyala new blog-api --template=mvc --database=postgres
cd blog-api
npm install
npm run db:migrate
npm run dev
```

Add a new resource to it:

```bash
nyala generate controller Post
nyala generate service Post
nyala generate repository Post
nyala generate migration create_posts_table
```

Ship it:

```bash
nyala build
npm start
```

## Where to Go Next

<div class="next-grid">

**[Commands →](./commands)**
Full reference for `new`, `dev`, the `db:*` commands, `build`, and `validate` — every flag and its default.

**[Generators →](./generators)**
Every `nyala generate <type>` subcommand, what file it writes, and where.

**[Templates →](./templates)**
What's inside the `mvc`, `saas`, `cms`, and `inertia` starters, and how to choose between them.

</div>

## Global Options

These apply to the CLI itself, not to a specific subcommand:

| Flag | Description |
|---|---|
| `-V, --version` | Print the installed CLI version and exit |
| `-h, --help` | Print usage; append after any command for command-specific help (e.g. `nyala new --help`) |

## Troubleshooting

### `nyala: command not found`

Either the global install didn't complete, or your global npm `bin` directory isn't on `PATH`. Confirm the install:

```bash
npm list -g @nyalajs/cli
```

If it's listed but the command still isn't found, add npm's global bin directory to `PATH`, or fall back to `npx @nyalajs/cli <command>` / the project-local `npm run` scripts a generated app already wires up.

### Permission denied on global install

```bash
sudo npm install -g @nyalajs/cli
```

Or configure npm to install globally without `sudo`:

```bash
mkdir ~/.npm-global
npm config set prefix '~/.npm-global'
export PATH=~/.npm-global/bin:$PATH
```

### A `generate` or `db:*` command silently does nothing / errors about a missing directory

You're very likely not in a project root. These commands resolve paths like `app/controllers/` and `database/migrations/` relative to your current working directory — run `cd` into the project first (see [Where Commands Run From](#where-commands-run-from) above).

## Uninstalling

```bash
npm uninstall -g @nyalajs/cli
```

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

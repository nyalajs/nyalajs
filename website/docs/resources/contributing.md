# Contributing

Nyala welcomes contributions. This page is a docs-site-friendly summary of the repository's [`CONTRIBUTING.md`](https://github.com/nyalajs/nyalajs/blob/main/CONTRIBUTING.md) — for anything not covered here, that file is the authoritative source.

## Development Setup

Clone the repository and install dependencies from the root — this is an npm workspaces monorepo, so a single `npm install` at the root wires up every package and template:

```bash
git clone https://github.com/nyalajs/nyala.git
cd nyala

npm install
npm run build
npm test
```

`npm run build` and `npm test` are [Turborepo](https://turbo.build/) pipelines (`turbo run build`, `turbo run test`) defined in the root `turbo.json` — they build/test every workspace package, respecting dependency order (`build` depends on `^build`, i.e. a package's dependencies build before it does).

Other root-level scripts worth knowing:

```bash
npm run lint     # turbo run lint across all workspaces
npm run dev      # turbo run dev
npm run clean    # turbo run clean && rm -rf node_modules
```

## Project Structure

The repository is an npm workspaces monorepo with two workspace globs: `packages/*` and `templates/*`.

```
nyala/
├── packages/           # Framework packages, published individually to npm
│   ├── core/           # Kernel, DI, modules
│   ├── http/            # HTTP adapter
│   ├── security/        # Auth & authorization
│   ├── tenancy/          # Multi-tenancy
│   ├── audit/            # Audit logging
│   ├── observability/    # Logging, metrics
│   ├── config/           # Configuration
│   ├── database/         # Drizzle ORM integration
│   ├── validation/       # Zod-based validation
│   ├── testing/          # Testing utilities
│   ├── cli/              # nyala CLI and generators
│   └── ...               # cache, queue, scheduler, events, mail, notifications, storage, react
├── templates/           # Starter templates copied by `nyala new`
│   ├── basic-starter/    # → the "mvc" template
│   ├── saas-starter/     # → the "saas" template
│   └── cms-starter/      # → the "cms" template
├── examples/            # Example applications
└── docs/                # Root-level markdown docs (this VitePress site lives in website/docs)
```

Each package under `packages/` has its own `package.json`, its own version (see the [Migration Guide](./migration) for why versions differ across packages), and its own `CHANGELOG.md` managed by [Changesets](https://github.com/changesets/changesets).

## Development Workflow

1. **Create a branch** from `main`.
2. **Make your changes**, with tests.
3. **Run tests** — `npm test` (runs the full workspace test suite via Turborepo/vitest).
4. **Build** — `npm run build`.
5. **Submit a PR** with a clear description of what changed and why.

## Working on a Single Package or Template

Because this is a Turborepo-orchestrated npm workspace, you don't have to build or test everything to iterate on one package. From the repo root:

```bash
# Build/test only @nyalajs/core and whatever it depends on
npx turbo run build --filter=@nyalajs/core
npx turbo run test --filter=@nyalajs/core

# Or just cd into the package/template and use its own scripts
cd packages/http && npm test
cd templates/cms-starter && npm test
```

`templates/*` are themselves npm workspaces with their own `package.json`, so a change to `templates/basic-starter` (the `mvc` template) should be tested the same way — `cd templates/basic-starter && npm test` — in addition to whatever integration you're exercising through the CLI's `nyala new` output.

## Continuous Integration

Every push and pull request against `main` or `develop` runs the CI workflow (`.github/workflows/ci.yml`), which matrix-tests against **Node 18.x and 20.x**:

```bash
npm ci
npm run build
npm test
npm run lint
```

There's also a separate coverage job that uploads results to Codecov. Make sure your change passes `npm run build`, `npm test`, and `npm run lint` locally before opening a PR — CI runs the exact same commands, so a local failure will fail CI too.

## Testing Requirements

- Unit tests for all new features.
- Property-based tests for core logic where applicable.
- Integration tests for HTTP endpoints.
- Minimum 80% code coverage.

If you're adding integration tests against controllers, use `@nyalajs/testing`'s `TestingModule`/`HttpTestClient` — as of `2.0.0` these actually bind and exercise real routes (an earlier version silently no-op'd, see the [Migration Guide](./migration)).

## Code Style

- TypeScript strict mode.
- Follow existing code patterns in the package you're touching — Nyala leans on consistency across packages (decorators, DI, naming conventions) more than most frameworks, so matching neighboring code matters more here than usual.
- Add JSDoc comments for public APIs.
- Use meaningful variable names.

## Commit Messages

Nyala follows [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add new feature
fix: fix bug
docs: update documentation
test: add tests
refactor: refactor code
```

## Pull Request Process

1. Update documentation alongside your change (including this docs site under `website/docs/` if user-facing behavior changed).
2. Add tests.
3. Ensure CI passes.
4. Request review.
5. Address feedback.

## Releasing (for maintainers)

Version bumps and changelogs are managed with [Changesets](https://github.com/changesets/changesets) (`@changesets/cli`); the root `release` script runs `changeset publish`. This is why packages in this monorepo version independently rather than in lockstep — see the [Migration Guide](./migration) for what that means in practice when upgrading.

## License

Nyala is released under the [MIT License](https://github.com/nyalajs/nyalajs/blob/main/LICENSE). By contributing, you agree that your contributions will be licensed under the same terms.

## Questions?

- Open a [GitHub Discussion](https://github.com/nyalajs/nyalajs/discussions) for open-ended questions.
- Open a [GitHub Issue](https://github.com/nyalajs/nyalajs/issues) for bugs or concrete feature requests.
- Read the full [`CONTRIBUTING.md`](https://github.com/nyalajs/nyalajs/blob/main/CONTRIBUTING.md) for anything this summary didn't cover.

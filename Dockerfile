# Builds the Nyala monorepo itself (framework packages + CLI), not a
# scaffolded application. Useful for CI parity and for verifying the repo
# builds in a clean, reproducible environment without installing Node/npm
# locally.
#
# To containerize an actual application, scaffold one first
# (`nyala new my-app`) and use that project's own Dockerfile — e.g.
# templates/saas-starter/Dockerfile — which builds a real deployable app
# image with pinned dependencies. This root Dockerfile builds the monorepo
# workspace itself, where framework packages reference each other via
# `workspace:*`/`*` and can't be built independently of one another.
FROM node:20-alpine AS builder

WORKDIR /repo

# Install git — turbo/changesets shell out to it for change detection, and
# @nyalajs/cli's build (packages/cli/scripts/copy-templates.js) runs
# `git ls-files` to determine which template files to bundle into the
# published package, so `.git` (copied below) must be a real checkout.
RUN apk add --no-cache git python3 make g++

COPY .git ./.git
COPY package.json package-lock.json turbo.json tsconfig.base.json ./
COPY packages ./packages
COPY templates ./templates
COPY examples ./examples

RUN npm ci

# A stray host-generated `packages/*/tsconfig.tsbuildinfo` must never
# reach this COPY — .dockerignore's `**/*.tsbuildinfo` excludes it, same
# as `**/dist`. With `composite: true`, tsc trusts a present-but-stale
# buildinfo, decides the project is already up to date, and silently
# no-ops (exit 0, zero files emitted, no `dist/` written) instead of
# compiling — which then breaks every downstream package that depends on
# this one's (missing) output.
RUN npx turbo run build --filter='./packages/*' && npm install && npx turbo run build

# ---------------------------------------------------------------------------
# Default runtime image: the built CLI, globally linked, so `docker run
# <image> nyala --version` (or any `nyala` subcommand) works out of the box.
# ---------------------------------------------------------------------------
FROM node:20-alpine AS cli

WORKDIR /repo

COPY --from=builder /repo /repo

RUN npm link --workspace=@nyalajs/cli

ENTRYPOINT ["nyala"]
CMD ["--help"]

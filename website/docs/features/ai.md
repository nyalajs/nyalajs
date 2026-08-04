# AI Assistant

`@nyalajs/ai` adds framework-aware AI commands to the `nyala` CLI. It's grounded in your actual project — it boots your real module graph and routes rather than guessing from regex, and it's fed hand-written Nyala conventions (DI, tenancy, routing, validation) so it doesn't fall back on generic Nest/Laravel-shaped assumptions that don't hold here.

## Installation

```bash
npm install @nyalajs/ai
```

Commands register into the `nyala` CLI automatically — `nyala --help` picks up `ask`, `explain`, `review`, `doctor`, and `resolve` with no configuration beyond installing the package.

## Configuring a Provider

Set credentials in `.env`. `@nyalajs/ai` supports Anthropic, Gemini, OpenAI, Groq, DeepSeek, OpenRouter, and local Ollama:

```env
AI_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...
```

```env
# Or any OpenAI-compatible vendor
AI_PROVIDER=groq
GROQ_API_KEY=...
AI_MODEL=llama-3.3-70b-versatile
```

```env
# Local, no key required
AI_PROVIDER=ollama
AI_BASE_URL=http://localhost:11434/v1
AI_MODEL=llama3
```

The Anthropic provider also accepts `ANTHROPIC_AUTH_TOKEN` as a Bearer-token alternative to `ANTHROPIC_API_KEY`, for setups that issue their own tokens (e.g. an internal auth gateway in front of the Anthropic API) rather than a Console API key.

`nyala doctor` is the one command that doesn't need any of this — it's static, deterministic, framework-aware checks with no AI call involved.

## Commands

### `nyala ask`

Ask a question with your project's real context (module graph, routes, framework conventions) already loaded:

```bash
nyala ask "how do I add a new tenant-scoped model?"
```

### `nyala explain <file>`

Explains a specific file in terms of how it fits into your actual app — what module it belongs to, what it's wired to:

```bash
nyala explain src/controllers/users.controller.ts
```

### `nyala review`

Reviews your currently staged changes (`git diff --cached`) against Nyala conventions:

```bash
git add .
nyala review
```

### `nyala doctor`

Deterministic, framework-aware diagnostics — no AI provider required. Checks things like unwired tenant middleware, missing module registrations, and other structural issues specific to how Nyala apps are supposed to be assembled:

```bash
nyala doctor
```

### `nyala resolve <issue>`

An agentic loop that reads your project, proposes an action, executes it, and repeats until it reports done — for actually fixing something, not just discussing it:

```bash
nyala resolve "fix the failing pagination test in users.service.spec.ts"
nyala resolve "add a DELETE endpoint to the posts controller" --max-iterations 15
```

Progress prints per iteration, and `Ctrl+C` stops cleanly after the current step rather than killing the process mid-write.

## How `resolve` Stays Safe

`resolve` never touches your real working tree. Every run:

1. Creates a new git worktree on a new branch.
2. Makes all its changes there — reads, writes, and commands all execute inside that isolated worktree.
3. Commits its changes to that branch once it finishes.
4. Prints the branch name so you can review the diff and merge it yourself.

Nothing is ever auto-merged. Your actual checkout is untouched for the entire run — if you don't like the result, delete the branch and nothing was lost.

```bash
nyala resolve "add input validation to the signup form"
# ...
# Changes committed to branch: nyala/resolve-1234567890
# Review with: git diff main..nyala/resolve-1234567890
# Merge with:  git merge nyala/resolve-1234567890
```

Every run's full transcript is also saved to `.nyala/resolve-runs/<runId>.json`, and a token usage summary prints at the end of the run.

## Security

`SecretRedactor` keeps two things from ever reaching a provider:

- **File access** — `.env*` files, common key/credential file patterns, and anything matched by your `.gitignore` are excluded from what `resolve` and `explain` will read, using real `.gitignore` parsing rather than hand-rolled glob matching.
- **Content sent** — before anything is sent to a provider, secret-shaped substrings (API keys, JWTs, PEM blocks, generic `KEY=value` assignments) are scrubbed from it.

## Extending

Third parties can register a new AI provider driver without editing `@nyalajs/ai` itself:

```typescript
import { AiService } from '@nyalajs/ai';

AiService.registerProviderFactory({
  driver: 'my-custom-provider',
  build(config, name) {
    return new MyCustomProvider(config, name);
  },
});
```

The agent loop's actions are pluggable `Tool` implementations dispatched through a `ToolRegistry`, not a hardcoded switch statement — the same shape a future MCP adapter would plug into.

For the full picture of what's built today versus deliberately deferred (and why), see [`packages/ai/ARCHITECTURE.md`](https://github.com/nyalajs/nyalajs/blob/main/packages/ai/ARCHITECTURE.md) in the repo.

## Next Steps

- [CLI Overview](../cli/overview) - The `nyala` CLI
- [Core Concepts](../concepts/architecture) - How Nyala apps are structured

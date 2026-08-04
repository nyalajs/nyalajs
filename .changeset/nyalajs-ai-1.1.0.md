---
"@nyalajs/ai": minor
---

Introduce `@nyalajs/ai`: framework-aware AI assistance for Nyala JS.

- Multi-provider chat/explain/review (`nyala ask`, `nyala explain <file>`, `nyala review`), covering Anthropic, Gemini, and every OpenAI-compatible vendor (OpenAI, Groq, DeepSeek, OpenRouter, Ollama) through a shared provider abstraction with built-in retry/rate-limiting.
- `nyala doctor` — deterministic, framework-aware diagnostics (e.g. detects unwired tenant middleware). No AI provider required.
- `nyala resolve <issue>` — an agentic issue resolver that works entirely inside an isolated git worktree on a new branch, never the developer's real working tree; changes are committed to the branch for manual review and merge, never auto-merged.
- Real, framework-grounded context: `ProjectContextService` boots the target app's actual `Kernel` to get the real module graph and routes; `FrameworkKnowledge` supplies accurate Nyala conventions instead of relying on generic assumptions from other frameworks.
- Security by construction: `SecretRedactor` excludes `.env*`/key files/gitignored paths from ever being read, and scrubs secret-shaped content from anything that is sent to a provider.
- v1.1 additions, each with a real consumer from day one (see `packages/ai/ARCHITECTURE.md` for the full evolution rationale): a provider registry (third parties can register a new AI vendor without editing this package), a tool registry (the agent loop's actions are pluggable `Tool` implementations, not a hardcoded switch — also the integration point a future MCP adapter would use), a `TranscriptStore` (every `resolve` run's transcript is saved, not discarded), progress events and `AbortSignal` support on the agent loop (`resolve` now shows per-iteration progress and stops cleanly on Ctrl+C), and per-run token usage accounting.

Also adds `packages/ai/ARCHITECTURE.md`, an evolution document distinguishing what's built today from what's deliberately deferred and why — so "why isn't X built yet" has a written answer before it becomes a competing pull request.

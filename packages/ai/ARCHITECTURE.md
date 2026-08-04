# Nyala AI — Architecture Evolution

This document exists so that "why isn't X built yet" has a written answer
before it becomes a pull request. If something you need isn't in **Today**,
it's almost certainly in **Possible Future** on purpose — read why before
proposing a design for it. If it's in neither list, that's a real gap; open
an issue describing the concrete thing you need to build, not the
abstraction you think should exist.

This is not a roadmap with dates. Nothing in **Possible Future** is
scheduled. Each entry only moves to **Today** when a real, concrete
consumer needs it — see [Design Principles](#design-principles) for what
that bar means in practice.

## Today (v1.1)

Everything below exists, is tested, and has at least one real caller.

**Providers** — `AiProvider` interface, 3 translator implementations
(Anthropic native, Gemini native, one OpenAI-compatible translator covering
OpenAI/Groq/DeepSeek/OpenRouter/Ollama via config presets), wrapped
uniformly in `RetryingAiProvider` (retry-with-backoff, concurrency/interval
rate limiting). Open for extension via `AiProviderFactory` — third parties
register a new driver without editing `ai.service.ts`.

**Auth beyond a raw API key** — the Anthropic provider also accepts
`authToken` (`ANTHROPIC_AUTH_TOKEN`), the SDK's separate Bearer-token auth
path, as an alternative to `apiKey` (`ANTHROPIC_API_KEY`) — e.g. for a token
from a Claude subscription rather than a separately-billed API key. This
package doesn't implement an OAuth login flow itself; it accepts a token
you already hold, exactly like the underlying SDK does. Other drivers don't
have an equivalent distinct mechanism in their SDKs, so this is currently
Anthropic-specific.

**Tools** — `Tool` interface (`name`, `description`, `parameters`,
`execute()`), dispatched through a `ToolRegistry`. Ships with three built-in
tools: `read_file`, `write_file`, `run_command`. This is also the
integration point a future MCP adapter would plug into — see below.

**Agentic loop** (`AgentLoop`) — a ReAct-style loop: propose one action,
execute it via the tool registry, feed the result back, repeat until the
model reports done. Uses a provider-agnostic text-based action protocol
(the model responds with a fenced JSON block) rather than each provider's
native tool-calling API — deliberate, not a shortcut: tool-calling formats
genuinely differ per vendor, and a text protocol works identically against
every provider this package supports.

**Isolation** (`WorktreeManager`) — every `resolve` run happens in a new git
worktree on a new branch, never the developer's real working tree. Changes
are committed to the branch on success; the developer reviews and merges
manually. Nothing here is auto-merged, ever.

**Transcript persistence** (`TranscriptStore` / `FileTranscriptStore`) —
every `resolve` run's full message transcript is saved to
`.nyala/resolve-runs/<runId>.json`. Not exposed as a `nyala observe` command
yet (nobody's asked for one) — but the data isn't thrown away anymore, so
building that command later is a formatter, not a new subsystem.

**Progress events** — `AgentLoop.run()` accepts an `onIteration` callback,
fired once per loop iteration with the action taken and its result. `resolve`
prints one line per iteration instead of going silent until it finishes.

**Cancellation** — `AgentLoop.run()` accepts a standard `AbortSignal`,
checked between iterations. `resolve` wires this to `SIGINT` so Ctrl+C stops
cleanly instead of killing the process mid-write.

**Usage accounting** — `AgentLoopResult.usage` collects each call's
`{inputTokens, outputTokens}`. `resolve` prints a per-run total. Not a cost
dashboard — just data that already existed and was being discarded.

**Context** — `ProjectContextService` boots the target app's real `Kernel`
in a subprocess (same mechanism `@nyalajs/cli`'s migration runner uses) to
get the actual module graph and routes, not a regex approximation.
`FrameworkKnowledge` supplies accurate, hand-written Nyala conventions
(DI, tenancy, routing, validation) so the model isn't relying on generic
Nest/Laravel-shaped assumptions that don't hold here.

**Security** — `SecretRedactor` excludes `.env*`/key files/gitignored paths
from ever being read, and scrubs secret-shaped substrings (API keys, JWTs,
PEM blocks, generic key/value assignments) from anything that does get sent.

**CLI** — `nyala ask`, `explain <file>`, `review`, `doctor` (no AI provider
required — static, framework-aware checks), `resolve <issue>`. Registered
into `@nyalajs/cli` via the package-discovery mechanism (`registerCommands`
exported from `@nyalajs/ai/cli`) — zero changes to `@nyalajs/cli` itself.

## Possible Future

Nothing below has an interface, a stub, or a scheduled date. Each entry has
a one-line reason it isn't built and the concrete signal that would justify
starting it.

| Capability | Why not now | What would trigger it |
|---|---|---|
| **Native tool-calling per provider** | No verified second implementation possible without live API access to each vendor; the current text protocol works identically everywhere. | Someone builds and verifies a provider-specific `ActionProtocol` against a real account. |
| **Custom knowledge / redaction rules** | No concrete consumer today — no project has asked to inject its own conventions doc or proprietary secret patterns. | A real project needs it; both are a one-parameter addition when that happens. |
| **Memory beyond transcript persistence** (semantic, vector, episodic, knowledge-graph) | There's no evidence anyone needs cross-run recall yet, and building it on top of a store that doesn't even have a `nyala observe` reader yet is solving floor 10 with no floor 1. | Real, repeated demand for "remember what we learned across runs," after `nyala observe` exists. |
| **Workflow engine** (DAG, state machines, rollback/compensation, human approval) | A different product category (Temporal/Airflow-shaped), not incremental to anything here. `AgentLoop.run()` is already a plain async function with no CLI coupling — a future workflow engine can treat one `resolve` run as one node in a graph without `AgentLoop` changing at all. | A concrete multi-step orchestration need that a shell script or CI pipeline genuinely can't cover. |
| **MCP client** | No MCP server referenced anywhere in this project. The integration point (`Tool`) already exists; MCP support is an `McpToolSource` adapter away, whenever it's needed. | An actual MCP server someone wants to use from `resolve`. |
| **Multi-agent orchestration** (coordinator/specialist/delegation) | Running N independent `AgentLoop`s concurrently on N issues already works today — each gets its own isolated worktree, no new code required. What's missing (shared state, delegation protocols) has no evidenced need. | A real task that one agent genuinely can't do alone, not "multi-agent" as a feature to have. |
| **Hosted / cloud execution** | `WorktreeManager` and `AgentLoop`'s tool execution talk to the local filesystem and local processes directly. This is the least future-proofed part of the current design, left that way on purpose — abstracting it with only one real implementation (local) would be speculation. | Someone actually builds a hosted version of `resolve`. The refactor is contained: extract a `Workspace`/`ActionExecutor` interface, keep `LocalWorkspace` as the only shipped implementation until a second one is real. |
| **Permissions / RBAC / ABAC / tenant isolation** | `resolve` runs as one local CLI process under the invoking developer's own OS permissions — there's no multi-user surface for a policy engine to apply to. | A hosted execution model (above) exists. When it does, reuse `@nyalajs/core`'s `TenantContext` and `@nyalajs/security`, don't invent a parallel policy engine inside this package. |
| **Observability dashboard / distributed tracing** | `AgentLoopResult.usage` and `TranscriptStore` already capture the raw data. No UI, no OpenTelemetry integration exists to consume it yet. | Real usage volume where "print a number in the terminal" stops being enough. When it happens, tracing wraps `AgentLoop` from outside — the same pattern `RetryingAiProvider` already proves works here — not a rewrite. |
| **Provider capability detection** (which models support what) | No router or fallback logic exists yet to consult it. | A `FallbackAiProvider` or cost-based router gets built (itself deferred — see below) and needs to know what a provider can do. |
| **Automatic provider fallback / cost-based routing** | No evidenced need — nobody's hit a provider outage or cost ceiling in practice yet. | It becomes additive whenever it's real: `FallbackAiProvider implements AiProvider`, wrapping several providers, exactly like `RetryingAiProvider` wraps one. No change to the `AiProvider` interface required. |

## Design Principles

Why the boundary above is drawn where it is, not just where:

1. **No interface ships without a real implementation using it the same day.** Every entry in Today has a concrete caller in this codebase right now. Nothing in Possible Future does — that's the actual test, not a vibe.
2. **Additive-only changes.** Result and config types only grow optional fields; required shapes don't change shape or meaning once shipped.
3. **New capability = new class or new package, not a new required constructor argument** on an existing one.
4. **Wrap, don't modify**, for cross-cutting concerns. `RetryingAiProvider` wrapping `AiProvider` is the proof this works here — the next cross-cutting concern (tracing, fallback) should use the same shape, not a new one.
5. **Primitives stay free of global state and CLI coupling.** `AgentLoop`, `Tool`, `AiProvider` don't know they're running inside a CLI. That's *why* a workflow engine, a multi-agent scheduler, or a hosted runtime can reuse them later without a rewrite — the decoupling is the extensibility, not any particular interface.
6. **Not every class needs an interface.** `AiService`, the CLI command classes, and config loading are deliberately concrete — one real implementation each, no evidence a second one would ever exist. An interface with one permanent implementer is overhead, not flexibility.

## How to propose moving something from Future to Today

Open an issue with: the concrete thing you're trying to build, why the
current primitives don't support it, and what the smallest useful interface
would be. Don't open a PR with a new abstraction for something still in the
Future list — read the "why not now" first; if it no longer applies, say so
in the issue and let the design get agreed before code.

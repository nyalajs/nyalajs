import { AiService } from "../ai.service";
import { AiMessage, AiUsage } from "../providers/types";
import { FrameworkKnowledge } from "../knowledge/framework-knowledge";
import { SecretRedactor } from "../security/redaction";
import { Tool, ToolContext } from "./tool";
import { ToolRegistry } from "./tool-registry";
import { createDefaultToolRegistry } from "./built-in-tools";

export interface AgentAction {
    /** "done", or the name of a registered Tool. */
    type: string;
    /** Arguments passed to the tool's execute() — ignored for "done". */
    args?: Record<string, unknown>;
    /** Only meaningful when type === "done". */
    summary?: string;
}

/** Fired once per loop iteration — the hook a future streaming UI or `nyala observe --live` would subscribe to. */
export interface AgentLoopEvent {
    iteration: number;
    action: AgentAction;
    /** Absent for the "done" event — there's no tool execution step to observe. */
    observation?: string;
}

export interface AgentLoopOptions {
    maxIterations?: number;
    commandTimeoutMs?: number;
    /** Called once per iteration, after the action (and, unless it's "done", its result) is known. */
    onIteration?: (event: AgentLoopEvent) => void;
    /** Checked once at the top of each iteration — stops the loop between iterations, not mid-tool-execution. */
    signal?: AbortSignal;
}

export interface AgentLoopResult {
    summary: string;
    iterations: number;
    transcript: AiMessage[];
    /** One entry per completion call that reported usage — not every provider always does. */
    usage: AiUsage[];
}

/**
 * A ReAct-style loop: propose one action, execute it via the ToolRegistry,
 * feed the result back, repeat until the model reports "done" (or
 * maxIterations runs out).
 *
 * Uses a plain-text JSON action protocol instead of each provider's native
 * tool-calling API. This is a deliberate choice, not a shortcut: tool
 * calling genuinely isn't provider-agnostic (Anthropic's tool_use blocks,
 * OpenAI's function calling, and Gemini's function declarations all differ
 * — see RetryingAiProvider's own comment on why cross-cutting concerns and
 * per-vendor format concerns are split into separate layers). A text
 * protocol works identically against every provider AiService supports,
 * and — unlike native tool-calling, which there's no way to verify without
 * live API access to each vendor — is fully testable by mocking
 * AiService.complete()'s text output.
 *
 * "done" is loop control, not a Tool — a real tool source (e.g. a future
 * MCP adapter) has no business offering a "done" tool, so it's handled
 * separately from ToolRegistry dispatch.
 *
 * Never writes outside `workdir` — callers are expected to pass an
 * isolated git worktree path, not the developer's real working tree.
 */
export class AgentLoop {
    private readonly tools: ToolRegistry;

    constructor(
        private readonly aiService: AiService,
        private readonly knowledge: FrameworkKnowledge,
        private readonly workdir: string,
        private readonly redactor: SecretRedactor,
        tools?: ToolRegistry
    ) {
        this.tools = tools ?? createDefaultToolRegistry();
    }

    private buildSystemPrompt(): string {
        const toolDocs = this.tools
            .list()
            .map((tool: Tool) => `  ${tool.name} — ${tool.description}\n    args: ${JSON.stringify(tool.parameters)}`)
            .join("\n");

        return [
            "You are an autonomous agent fixing an issue in a Nyala JS application. You work inside an isolated git worktree — changes here are safe to make freely; nothing you do affects the developer's real working tree until they explicitly review and merge your branch.",
            "",
            'Respond with EXACTLY ONE action per turn, as a single fenced ```json code block: {"type": "<tool name or \\"done\\">", "args": {...}}',
            "",
            "Available tools:",
            toolDocs,
            "",
            'To finish: {"type": "done", "summary": "one paragraph describing what was fixed and why"}',
            "",
            "Use read_file to inspect code before changing it. Use run_command to verify a fix (typecheck/tests) before declaring done — never declare done without having run at least one verification command that passed.",
            "",
            this.knowledge.asPromptBlock(),
        ].join("\n");
    }

    private parseAction(responseText: string): AgentAction {
        const fenced = responseText.match(/```json\s*([\s\S]*?)\s*```/);
        const jsonText = fenced ? fenced[1] : responseText;

        let parsed: any;
        try {
            parsed = JSON.parse(jsonText);
        } catch {
            throw new Error(`Agent response wasn't valid JSON: ${responseText.slice(0, 200)}`);
        }
        if (!parsed || typeof parsed.type !== "string") {
            throw new Error(`Agent response missing "type": ${jsonText.slice(0, 200)}`);
        }
        return parsed as AgentAction;
    }

    private async executeAction(action: AgentAction, commandTimeoutMs: number): Promise<string> {
        const tool = this.tools.get(action.type);
        if (!tool) {
            const known = this.tools.list().map((t) => t.name).join(", ");
            throw new Error(`Unknown tool "${action.type}". Available tools: ${known}`);
        }

        const ctx: ToolContext = { workdir: this.workdir, redactor: this.redactor, commandTimeoutMs };
        const result = await tool.execute(action.args ?? {}, ctx);
        return result.output;
    }

    async run(issueDescription: string, options: AgentLoopOptions = {}): Promise<AgentLoopResult> {
        const maxIterations = options.maxIterations ?? 15;
        const commandTimeoutMs = options.commandTimeoutMs ?? 120_000;

        const messages: AiMessage[] = [
            { role: "system", content: this.buildSystemPrompt() },
            { role: "user", content: `Fix this issue: ${issueDescription}` },
        ];
        const usage: AiUsage[] = [];

        for (let iteration = 1; iteration <= maxIterations; iteration++) {
            if (options.signal?.aborted) {
                const abortError = new Error("Agent run was aborted.");
                abortError.name = "AbortError";
                throw abortError;
            }

            const result = await this.aiService.complete(messages);
            if (result.usage) usage.push(result.usage);
            messages.push({ role: "assistant", content: result.text });

            const action = this.parseAction(result.text);

            if (action.type === "done") {
                options.onIteration?.({ iteration, action });
                return { summary: action.summary ?? "Done.", iterations: iteration, transcript: messages, usage };
            }

            const observation = await this.executeAction(action, commandTimeoutMs);
            options.onIteration?.({ iteration, action, observation });
            messages.push({ role: "user", content: `Result:\n${observation}` });
        }

        throw new Error(`Agent did not finish within ${maxIterations} iterations.`);
    }
}

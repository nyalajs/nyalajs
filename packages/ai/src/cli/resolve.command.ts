import { AiService } from "../ai.service";
import { FrameworkKnowledge } from "../knowledge/framework-knowledge";
import { SecretRedactor } from "../security/redaction";
import { AgentLoop, AgentLoopOptions } from "../agent/agent-loop";
import { WorktreeManager } from "../agent/worktree-manager";
import { TranscriptStore } from "../memory/transcript-store";
import { FileTranscriptStore } from "../memory/file-transcript-store";
import { loadAiServiceFromEnv } from "./load-ai-service";

function newBranchName(): string {
    return `nyala-fix-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function summarizeUsage(usage: { inputTokens: number; outputTokens: number }[]): string | null {
    if (usage.length === 0) return null;
    const totals = usage.reduce(
        (acc, u) => ({ input: acc.input + u.inputTokens, output: acc.output + u.outputTokens }),
        { input: 0, output: 0 }
    );
    return `Usage: ${totals.input} input tokens, ${totals.output} output tokens across ${usage.length} call(s).`;
}

export class ResolveCommand {
    private readonly cwd: string;
    private readonly aiService: AiService;
    private readonly knowledge: FrameworkKnowledge;
    private readonly worktrees: WorktreeManager;
    private readonly transcripts: TranscriptStore;

    constructor(options: {
        cwd?: string;
        aiService?: AiService;
        knowledge?: FrameworkKnowledge;
        worktrees?: WorktreeManager;
        transcripts?: TranscriptStore;
    } = {}) {
        this.cwd = options.cwd ?? process.cwd();
        this.aiService = options.aiService ?? loadAiServiceFromEnv(this.cwd);
        this.knowledge = options.knowledge ?? new FrameworkKnowledge();
        this.worktrees = options.worktrees ?? new WorktreeManager(this.cwd);
        this.transcripts = options.transcripts ?? new FileTranscriptStore();
    }

    async run(issueDescription: string, agentOptions: AgentLoopOptions = {}): Promise<void> {
        const branchName = newBranchName();
        const worktreePath = await this.worktrees.create(branchName);

        console.log(`Working in an isolated worktree — your working tree is untouched.`);
        console.log(`  branch: ${branchName}`);
        console.log(`  path:   ${worktreePath}\n`);

        const redactor = new SecretRedactor(worktreePath);
        const agent = new AgentLoop(this.aiService, this.knowledge, worktreePath, redactor);

        // Only wire our own SIGINT -> abort if the caller didn't already
        // hand us a signal (e.g. a test driving cancellation directly) —
        // simpler than merging two AbortSignals for a case that doesn't
        // otherwise arise.
        let controller: AbortController | undefined;
        let sigintHandler: (() => void) | undefined;
        if (!agentOptions.signal) {
            controller = new AbortController();
            sigintHandler = () => {
                console.log("\nStopping after the current step...");
                controller!.abort();
            };
            process.once("SIGINT", sigintHandler);
        }

        const runOptions: AgentLoopOptions = {
            ...agentOptions,
            signal: agentOptions.signal ?? controller?.signal,
            onIteration: (event) => {
                console.log(`  [${event.iteration}] ${event.action.type}`);
                agentOptions.onIteration?.(event);
            },
        };

        try {
            const { summary, iterations, usage, transcript } = await agent.run(issueDescription, runOptions);
            await this.transcripts.save(branchName, transcript);

            console.log(`\nDone after ${iterations} iteration(s):\n${summary}\n`);
            const usageLine = summarizeUsage(usage);
            if (usageLine) console.log(usageLine);

            if (this.worktrees.hasChanges(worktreePath)) {
                console.log(this.worktrees.getDiffStat(worktreePath));
                const committed = this.worktrees.commitAll(worktreePath, `nyala resolve: ${summary}`);
                if (!committed) {
                    console.error(
                        `[nyala/ai] Could not commit the fix on branch "${branchName}" (check your git commit config, e.g. commit signing). ` +
                        `The change is still on disk at ${worktreePath}, uncommitted.`
                    );
                    return;
                }
                console.log(`Review the branch, then merge it yourself when you're satisfied:`);
                console.log(`  git merge ${branchName}`);
            } else {
                console.log("The agent finished without making any changes.");
                this.worktrees.remove(worktreePath);
            }
        } catch (error) {
            if ((error as Error).name === "AbortError") {
                console.log(`\nCancelled.`);
            } else {
                console.error(`\n[nyala/ai] Agent stopped before finishing: ${(error as Error).message}`);
            }

            if (this.worktrees.hasChanges(worktreePath)) {
                console.log(`Partial work is preserved on branch "${branchName}" at ${worktreePath} for inspection.`);
            } else {
                this.worktrees.remove(worktreePath);
            }
            throw error;
        } finally {
            if (sigintHandler) process.removeListener("SIGINT", sigintHandler);
        }
    }
}

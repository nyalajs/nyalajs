import { spawnSync } from "child_process";
import { AiService } from "../ai.service";
import { AiMessage } from "../providers/types";
import { FrameworkKnowledge } from "../knowledge/framework-knowledge";
import { SecretRedactor } from "../security/redaction";
import { loadAiServiceFromEnv } from "./load-ai-service";

export class ReviewCommand {
    private readonly cwd: string;
    private readonly aiService: AiService;
    private readonly knowledge: FrameworkKnowledge;
    private readonly redactor: SecretRedactor;

    constructor(options: {
        cwd?: string;
        aiService?: AiService;
        knowledge?: FrameworkKnowledge;
        redactor?: SecretRedactor;
    } = {}) {
        this.cwd = options.cwd ?? process.cwd();
        this.aiService = options.aiService ?? loadAiServiceFromEnv(this.cwd);
        this.knowledge = options.knowledge ?? new FrameworkKnowledge();
        this.redactor = options.redactor ?? new SecretRedactor(this.cwd);
    }

    /** The working-tree diff against HEAD — staged and unstaged changes both included, matching what a developer is about to commit. */
    getDiff(): string {
        const result = spawnSync("git", ["diff", "HEAD"], { cwd: this.cwd, encoding: "utf-8" });

        if (result.error) {
            throw new Error(`[nyala/ai] Failed to run git diff: ${result.error.message}`);
        }
        if (result.status !== 0) {
            throw new Error(`[nyala/ai] git diff failed: ${result.stderr}`);
        }
        return result.stdout;
    }

    buildMessages(diff: string): AiMessage[] {
        const redacted = this.redactor.redactContent(diff);
        return [
            {
                role: "system",
                content: `You are reviewing a code change in a Nyala JS application. Use the following authoritative framework conventions to catch framework-specific mistakes, not just generic code-review issues — a violation of these conventions (e.g. storing a tenant id on a singleton service) is a more serious finding than a style nit:\n\n${this.knowledge.asPromptBlock()}`,
            },
            { role: "user", content: `Review this diff:\n\n\`\`\`diff\n${redacted}\n\`\`\`` },
        ];
    }

    async run(): Promise<void> {
        const diff = this.getDiff();
        if (!diff.trim()) {
            console.log("No uncommitted changes to review.");
            return;
        }

        const messages = this.buildMessages(diff);
        for await (const chunk of this.aiService.stream(messages)) {
            process.stdout.write(chunk);
        }
        process.stdout.write("\n");
    }
}

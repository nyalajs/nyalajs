import { AiService } from "../ai.service";
import { AiMessage } from "../providers/types";
import { FrameworkKnowledge } from "../knowledge/framework-knowledge";
import { SecretRedactor } from "../security/redaction";
import { loadAiServiceFromEnv } from "./load-ai-service";

export class ExplainCommand {
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

    async buildMessages(relativeFilePath: string): Promise<AiMessage[]> {
        const content = await this.redactor.readRedacted(relativeFilePath);
        if (content === null) {
            throw new Error(
                `[nyala/ai] Refusing to read ${relativeFilePath} — it matches a secret-file pattern or is gitignored.`
            );
        }

        return [
            {
                role: "system",
                content: `You are an expert on the Nyala JS framework. Use the following authoritative conventions — they take precedence over general knowledge of similarly-named patterns in other frameworks:\n\n${this.knowledge.asPromptBlock()}`,
            },
            {
                role: "user",
                content: `Explain what this file does and how it fits into a Nyala JS app.\n\nFile: ${relativeFilePath}\n\n\`\`\`\n${content}\n\`\`\``,
            },
        ];
    }

    async run(relativeFilePath: string): Promise<void> {
        const messages = await this.buildMessages(relativeFilePath);
        for await (const chunk of this.aiService.stream(messages)) {
            process.stdout.write(chunk);
        }
        process.stdout.write("\n");
    }
}

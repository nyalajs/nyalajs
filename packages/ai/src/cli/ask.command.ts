import { AiService } from "../ai.service";
import { AiMessage } from "../providers/types";
import { FrameworkKnowledge } from "../knowledge/framework-knowledge";
import { loadAiServiceFromEnv } from "./load-ai-service";

export class AskCommand {
    private readonly aiService: AiService;
    private readonly knowledge: FrameworkKnowledge;

    constructor(options: { cwd?: string; aiService?: AiService; knowledge?: FrameworkKnowledge } = {}) {
        this.aiService = options.aiService ?? loadAiServiceFromEnv(options.cwd);
        this.knowledge = options.knowledge ?? new FrameworkKnowledge();
    }

    buildMessages(question: string): AiMessage[] {
        return [
            {
                role: "system",
                content: `You are an expert on the Nyala JS framework. Use the following authoritative conventions when answering — they take precedence over general knowledge of similarly-named patterns in other frameworks:\n\n${this.knowledge.asPromptBlock()}`,
            },
            { role: "user", content: question },
        ];
    }

    async run(question: string): Promise<void> {
        for await (const chunk of this.aiService.stream(this.buildMessages(question))) {
            process.stdout.write(chunk);
        }
        process.stdout.write("\n");
    }
}

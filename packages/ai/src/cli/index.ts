import { Command } from "commander";
import { AskCommand } from "./ask.command";
import { ExplainCommand } from "./explain.command";
import { ReviewCommand } from "./review.command";
import { DoctorCommand } from "./doctor.command";
import { ResolveCommand } from "./resolve.command";

/**
 * Entry point @nyalajs/cli's plugin-commands.ts dynamically imports from
 * "@nyalajs/ai/cli" (see that package's registerExternalCommands()) —
 * installing @nyalajs/ai in a project is enough for these commands to show
 * up in `nyala --help`, with no change needed to @nyalajs/cli itself.
 */
export function registerCommands(program: Command): void {
    program
        .command("ask <question>")
        .description("Ask a framework-aware question about Nyala JS")
        .action(async (question: string) => {
            try {
                await new AskCommand().run(question);
            } catch (error) {
                console.error((error as Error).message);
                process.exit(1);
            }
        });

    program
        .command("explain <file>")
        .description("Explain what a file does and how it fits into this Nyala JS app")
        .action(async (file: string) => {
            try {
                await new ExplainCommand().run(file);
            } catch (error) {
                console.error((error as Error).message);
                process.exit(1);
            }
        });

    program
        .command("review")
        .description("AI review of the current uncommitted changes (git diff HEAD), framework-conventions-aware")
        .action(async () => {
            try {
                await new ReviewCommand().run();
            } catch (error) {
                console.error((error as Error).message);
                process.exit(1);
            }
        });

    program
        .command("doctor")
        .description("Framework-aware diagnostics — catches misconfiguration like unwired tenant middleware. No AI provider needed.")
        .action(async () => {
            const passed = await new DoctorCommand().runAndPrint();
            if (!passed) process.exit(1);
        });

    program
        .command("resolve <issue>")
        .description(
            "Agentic issue resolver — works in an isolated git worktree on a new branch, never your real working tree; review and merge yourself when it's done."
        )
        .option("--max-iterations <n>", "Maximum agent loop iterations before giving up", "15")
        .action(async (issue: string, options: { maxIterations: string }) => {
            try {
                await new ResolveCommand().run(issue, { maxIterations: Number(options.maxIterations) });
            } catch (error) {
                console.error((error as Error).message);
                process.exit(1);
            }
        });
}

export { AskCommand } from "./ask.command";
export { ExplainCommand } from "./explain.command";
export { ReviewCommand } from "./review.command";
export { DoctorCommand, DoctorCheck, DoctorCheckResult } from "./doctor.command";
export { ResolveCommand } from "./resolve.command";
export { loadAiServiceFromEnv } from "./load-ai-service";

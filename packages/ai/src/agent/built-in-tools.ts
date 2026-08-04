import * as fs from "fs-extra";
import * as path from "path";
import { spawnSync } from "child_process";
import { Tool, ToolContext, ToolResult } from "./tool";
import { ToolRegistry } from "./tool-registry";

export const readFileTool: Tool = {
    name: "read_file",
    description: "Read a file's contents. Refused if it's a secret file or gitignored; secrets embedded in otherwise-readable files are redacted.",
    parameters: {
        type: "object",
        properties: { path: { type: "string", description: "Path relative to the workdir" } },
        required: ["path"],
    },
    async execute(args, ctx: ToolContext): Promise<ToolResult> {
        const filePath = args.path as string | undefined;
        if (!filePath) throw new Error('read_file requires "path"');

        const content = await ctx.redactor.readRedacted(filePath);
        return {
            output:
                content === null
                    ? `[refused: ${filePath} is excluded — matches a secret-file pattern or is gitignored]`
                    : content,
        };
    },
};

export const writeFileTool: Tool = {
    name: "write_file",
    description: "Write (or overwrite) a file with the given full content. Creates intermediate directories as needed.",
    parameters: {
        type: "object",
        properties: {
            path: { type: "string", description: "Path relative to the workdir" },
            content: { type: "string", description: "The full new content of the file" },
        },
        required: ["path", "content"],
    },
    async execute(args, ctx: ToolContext): Promise<ToolResult> {
        const filePath = args.path as string | undefined;
        const content = args.content as string | undefined;
        if (!filePath || content === undefined) {
            throw new Error('write_file requires "path" and "content"');
        }

        const fullPath = path.join(ctx.workdir, filePath);
        await fs.ensureDir(path.dirname(fullPath));
        await fs.writeFile(fullPath, content);
        return { output: `wrote ${filePath} (${content.length} bytes)` };
    },
};

export const runCommandTool: Tool = {
    name: "run_command",
    description: "Run a shell command inside the workdir (e.g. to typecheck or run tests) and see its output.",
    parameters: {
        type: "object",
        properties: { command: { type: "string" } },
        required: ["command"],
    },
    async execute(args, ctx: ToolContext): Promise<ToolResult> {
        const command = args.command as string | undefined;
        if (!command) throw new Error('run_command requires "command"');

        const result = spawnSync(command, {
            shell: true,
            cwd: ctx.workdir,
            encoding: "utf-8",
            timeout: ctx.commandTimeoutMs,
        });

        return {
            output: `exit code: ${result.status}\nstdout:\n${result.stdout ?? ""}\nstderr:\n${result.stderr ?? ""}`,
        };
    },
};

export function createDefaultToolRegistry(): ToolRegistry {
    const registry = new ToolRegistry();
    registry.register(readFileTool);
    registry.register(writeFileTool);
    registry.register(runCommandTool);
    return registry;
}

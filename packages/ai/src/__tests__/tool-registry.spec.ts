import { describe, it, expect, vi } from "vitest";
import * as fs from "fs-extra";
import * as path from "path";
import * as os from "os";
import { ToolRegistry } from "../agent/tool-registry";
import { Tool, ToolContext } from "../agent/tool";
import { createDefaultToolRegistry, readFileTool, writeFileTool, runCommandTool } from "../agent/built-in-tools";
import { SecretRedactor } from "../security/redaction";

describe("ToolRegistry", () => {
    it("registers and retrieves a tool by name", () => {
        const registry = new ToolRegistry();
        const tool: Tool = { name: "custom", description: "d", parameters: {}, execute: vi.fn() };

        registry.register(tool);

        expect(registry.get("custom")).toBe(tool);
    });

    it("get() returns undefined for an unregistered tool", () => {
        const registry = new ToolRegistry();
        expect(registry.get("nope")).toBeUndefined();
    });

    it("list() returns every registered tool", () => {
        const registry = new ToolRegistry();
        const a: Tool = { name: "a", description: "d", parameters: {}, execute: vi.fn() };
        const b: Tool = { name: "b", description: "d", parameters: {}, execute: vi.fn() };
        registry.register(a);
        registry.register(b);

        expect(registry.list()).toEqual([a, b]);
    });

    it("registering a tool with the same name overrides the previous one", () => {
        const registry = new ToolRegistry();
        const first: Tool = { name: "x", description: "first", parameters: {}, execute: vi.fn() };
        const second: Tool = { name: "x", description: "second", parameters: {}, execute: vi.fn() };
        registry.register(first);
        registry.register(second);

        expect(registry.get("x")).toBe(second);
        expect(registry.list()).toHaveLength(1);
    });
});

describe("createDefaultToolRegistry()", () => {
    it("registers exactly the three built-in tools", () => {
        const registry = createDefaultToolRegistry();
        const names = registry.list().map((t) => t.name).sort();
        expect(names).toEqual(["read_file", "run_command", "write_file"]);
    });

    it("a third party can add a custom tool to the default registry without modifying this package", async () => {
        const registry = createDefaultToolRegistry();
        const searchWebTool: Tool = {
            name: "search_web",
            description: "Search the web",
            parameters: { type: "object", properties: { query: { type: "string" } } },
            async execute(args) {
                return { output: `results for: ${args.query}` };
            },
        };

        registry.register(searchWebTool);

        expect(registry.list().map((t) => t.name)).toContain("search_web");
        const ctx = {} as ToolContext;
        const result = await registry.get("search_web")!.execute({ query: "nyala js" }, ctx);
        expect(result.output).toBe("results for: nyala js");
    });
});

describe("built-in tools — real filesystem/process behavior", () => {
    let workdir: string;

    async function ctx(commandTimeoutMs = 5000): Promise<ToolContext> {
        return { workdir, redactor: new SecretRedactor(workdir), commandTimeoutMs };
    }

    it("readFileTool reads a real file", async () => {
        workdir = await fs.mkdtemp(path.join(os.tmpdir(), "nyala-tool-"));
        await fs.writeFile(path.join(workdir, "a.ts"), "export const a = 1;");

        const result = await readFileTool.execute({ path: "a.ts" }, await ctx());

        expect(result.output).toBe("export const a = 1;");
        await fs.remove(workdir);
    });

    it("readFileTool throws when no path is given", async () => {
        workdir = await fs.mkdtemp(path.join(os.tmpdir(), "nyala-tool-"));
        await expect(readFileTool.execute({}, await ctx())).rejects.toThrow(/requires "path"/);
        await fs.remove(workdir);
    });

    it("writeFileTool writes a real file", async () => {
        workdir = await fs.mkdtemp(path.join(os.tmpdir(), "nyala-tool-"));

        await writeFileTool.execute({ path: "b.ts", content: "hello" }, await ctx());

        expect(await fs.readFile(path.join(workdir, "b.ts"), "utf-8")).toBe("hello");
        await fs.remove(workdir);
    });

    it("runCommandTool runs a real command", async () => {
        workdir = await fs.mkdtemp(path.join(os.tmpdir(), "nyala-tool-"));

        const result = await runCommandTool.execute({ command: "echo hi" }, await ctx());

        expect(result.output).toContain("hi");
        expect(result.output).toContain("exit code: 0");
        await fs.remove(workdir);
    });
});

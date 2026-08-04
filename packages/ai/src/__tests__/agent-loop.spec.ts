import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "fs-extra";
import * as path from "path";
import * as os from "os";
import { AgentLoop } from "../agent/agent-loop";
import { AiService } from "../ai.service";
import { FrameworkKnowledge } from "../knowledge/framework-knowledge";
import { SecretRedactor } from "../security/redaction";

function fakeAiService(responses: string[]) {
    const service = Object.create(AiService.prototype) as AiService;
    // AgentLoop mutates (pushes onto) the same `messages` array across
    // every iteration, so a mock that just records `mock.calls` ends up
    // with every call pointing at the SAME array reference, all showing
    // its final state. Snapshot (deep-copy) each call's argument here
    // instead, at the moment it's actually received.
    const snapshots: any[][] = [];
    let call = 0;
    (service as any).complete = vi.fn().mockImplementation(async (messages: any[]) => {
        snapshots.push(messages.map((m) => ({ ...m })));
        return { text: responses[call++], model: "fake" };
    });
    return {
        service,
        completeSpy: (service as any).complete as ReturnType<typeof vi.fn>,
        messagesAtCall: (index: number) => snapshots[index],
    };
}

function jsonAction(action: unknown): string {
    return "```json\n" + JSON.stringify(action) + "\n```";
}

/** Like fakeAiService, but each response can also report token usage. */
function fakeAiServiceWithUsage(responses: Array<{ text: string; usage?: { inputTokens: number; outputTokens: number } }>) {
    const service = Object.create(AiService.prototype) as AiService;
    let call = 0;
    (service as any).complete = vi.fn().mockImplementation(async () => {
        const response = responses[call++];
        return { text: response.text, model: "fake", usage: response.usage };
    });
    return { service };
}

describe("AgentLoop", () => {
    let workdir: string;
    const knowledge = new FrameworkKnowledge();

    beforeEach(async () => {
        workdir = await fs.mkdtemp(path.join(os.tmpdir(), "nyala-agent-loop-"));
    });

    afterEach(async () => {
        await fs.remove(workdir);
    });

    it("terminates immediately on a single-turn 'done' action", async () => {
        const { service } = fakeAiService([jsonAction({ type: "done", summary: "Nothing to do." })]);
        const agent = new AgentLoop(service, knowledge, workdir, new SecretRedactor(workdir));

        const result = await agent.run("no-op issue");

        expect(result.summary).toBe("Nothing to do.");
        expect(result.iterations).toBe(1);
    });

    it("writes a real file to the workdir via write_file", async () => {
        const { service } = fakeAiService([
            jsonAction({ type: "write_file", args: { path: "fix.ts", content: "export const fixed = true;" } }),
            jsonAction({ type: "done", summary: "Wrote the fix." }),
        ]);
        const agent = new AgentLoop(service, knowledge, workdir, new SecretRedactor(workdir));

        await agent.run("add a fix");

        const written = await fs.readFile(path.join(workdir, "fix.ts"), "utf-8");
        expect(written).toBe("export const fixed = true;");
    });

    it("write_file creates intermediate directories", async () => {
        const { service } = fakeAiService([
            jsonAction({ type: "write_file", args: { path: "app/controllers/new.controller.ts", content: "x" } }),
            jsonAction({ type: "done", summary: "done" }),
        ]);
        const agent = new AgentLoop(service, knowledge, workdir, new SecretRedactor(workdir));

        await agent.run("issue");

        expect(await fs.pathExists(path.join(workdir, "app/controllers/new.controller.ts"))).toBe(true);
    });

    it("reads a real file via read_file and feeds its content back as the next observation", async () => {
        await fs.writeFile(path.join(workdir, "existing.ts"), "export const x = 1;");
        const { service, messagesAtCall } = fakeAiService([
            jsonAction({ type: "read_file", args: { path: "existing.ts" } }),
            jsonAction({ type: "done", summary: "Read it." }),
        ]);
        const agent = new AgentLoop(service, knowledge, workdir, new SecretRedactor(workdir));

        await agent.run("inspect existing.ts");

        const lastMessage = messagesAtCall(1).at(-1);
        expect(lastMessage.content).toContain("export const x = 1;");
    });

    it("refuses to read a secret-shaped file, feeding the refusal back as the observation instead of throwing", async () => {
        await fs.writeFile(path.join(workdir, ".env"), "SECRET=abc");
        const { service } = fakeAiService([
            jsonAction({ type: "read_file", args: { path: ".env" } }),
            jsonAction({ type: "done", summary: "Could not read it, but that's fine." }),
        ]);
        const agent = new AgentLoop(service, knowledge, workdir, new SecretRedactor(workdir));

        const result = await agent.run("try to read .env");
        expect(result.iterations).toBe(2);
    });

    it("executes run_command for real and feeds stdout back as the observation", async () => {
        const { service, messagesAtCall } = fakeAiService([
            jsonAction({ type: "run_command", args: { command: "echo hello-from-agent" } }),
            jsonAction({ type: "done", summary: "Verified." }),
        ]);
        const agent = new AgentLoop(service, knowledge, workdir, new SecretRedactor(workdir));

        await agent.run("run a command");

        const lastMessage = messagesAtCall(1).at(-1);
        expect(lastMessage.content).toContain("hello-from-agent");
        expect(lastMessage.content).toContain("exit code: 0");
    });

    it("run_command reports a non-zero exit code, not just stdout", async () => {
        const { service, messagesAtCall } = fakeAiService([
            jsonAction({ type: "run_command", args: { command: "exit 1" } }),
            jsonAction({ type: "done", summary: "done" }),
        ]);
        const agent = new AgentLoop(service, knowledge, workdir, new SecretRedactor(workdir));

        await agent.run("run a failing command");

        const lastMessage = messagesAtCall(1).at(-1);
        expect(lastMessage.content).toContain("exit code: 1");
    });

    it("runs a realistic multi-step loop: read, write, verify, done", async () => {
        await fs.writeFile(path.join(workdir, "buggy.ts"), "export const bug = undefined;");
        const { service } = fakeAiService([
            jsonAction({ type: "read_file", args: { path: "buggy.ts" } }),
            jsonAction({ type: "write_file", args: { path: "buggy.ts", content: "export const bug = 1;" } }),
            jsonAction({ type: "run_command", args: { command: "cat buggy.ts" } }),
            jsonAction({ type: "done", summary: "Fixed buggy.ts." }),
        ]);
        const agent = new AgentLoop(service, knowledge, workdir, new SecretRedactor(workdir));

        const result = await agent.run("fix the bug");

        expect(result.iterations).toBe(4);
        expect(await fs.readFile(path.join(workdir, "buggy.ts"), "utf-8")).toBe("export const bug = 1;");
    });

    it("throws a clear error on a malformed (non-JSON) response", async () => {
        const { service } = fakeAiService(["I think we should just... fix it somehow?"]);
        const agent = new AgentLoop(service, knowledge, workdir, new SecretRedactor(workdir));

        await expect(agent.run("issue")).rejects.toThrow(/wasn't valid JSON/);
    });

    it("throws a clear error on JSON missing a type", async () => {
        const { service } = fakeAiService(["```json\n{\"foo\": \"bar\"}\n```"]);
        const agent = new AgentLoop(service, knowledge, workdir, new SecretRedactor(workdir));

        await expect(agent.run("issue")).rejects.toThrow(/missing "type"/);
    });

    it("throws a clear error naming known tools when the model names an unknown tool", async () => {
        const { service } = fakeAiService([jsonAction({ type: "search_web", args: { query: "x" } })]);
        const agent = new AgentLoop(service, knowledge, workdir, new SecretRedactor(workdir));

        await expect(agent.run("issue")).rejects.toThrow(/Unknown tool "search_web".*read_file.*write_file.*run_command/s);
    });

    it("gives up after maxIterations without a 'done'", async () => {
        const { service } = fakeAiService([
            jsonAction({ type: "run_command", args: { command: "true" } }),
            jsonAction({ type: "run_command", args: { command: "true" } }),
            jsonAction({ type: "run_command", args: { command: "true" } }),
        ]);
        const agent = new AgentLoop(service, knowledge, workdir, new SecretRedactor(workdir));

        await expect(agent.run("issue", { maxIterations: 3 })).rejects.toThrow(/did not finish within 3/);
    });

    it("includes the issue description and FrameworkKnowledge in the transcript's first two messages", async () => {
        const { service } = fakeAiService([jsonAction({ type: "done", summary: "ok" })]);
        const agent = new AgentLoop(service, knowledge, workdir, new SecretRedactor(workdir));

        const result = await agent.run("the users endpoint returns 500");

        expect(result.transcript[0].role).toBe("system");
        expect(result.transcript[0].content).toContain(knowledge.getTenancyConventions());
        expect(result.transcript[1]).toEqual({
            role: "user",
            content: "Fix this issue: the users endpoint returns 500",
        });
    });

    it("accepts a bare JSON action without the ```json fence too", async () => {
        const { service } = fakeAiService([JSON.stringify({ type: "done", summary: "ok" })]);
        const agent = new AgentLoop(service, knowledge, workdir, new SecretRedactor(workdir));

        const result = await agent.run("issue");
        expect(result.summary).toBe("ok");
    });

    it("the system prompt documents every registered tool by name and description", async () => {
        const { service, messagesAtCall } = fakeAiService([jsonAction({ type: "done", summary: "ok" })]);
        const agent = new AgentLoop(service, knowledge, workdir, new SecretRedactor(workdir));

        await agent.run("issue");

        const systemPrompt = messagesAtCall(0)[0].content;
        expect(systemPrompt).toContain("read_file");
        expect(systemPrompt).toContain("write_file");
        expect(systemPrompt).toContain("run_command");
    });
});

describe("AgentLoop — progress events", () => {
    let workdir: string;
    const knowledge = new FrameworkKnowledge();

    beforeEach(async () => {
        workdir = await fs.mkdtemp(path.join(os.tmpdir(), "nyala-agent-loop-progress-"));
    });

    afterEach(async () => {
        await fs.remove(workdir);
    });

    it("fires onIteration once per iteration, including the final 'done' one", async () => {
        const { service } = fakeAiService([
            jsonAction({ type: "run_command", args: { command: "echo hi" } }),
            jsonAction({ type: "done", summary: "done" }),
        ]);
        const agent = new AgentLoop(service, knowledge, workdir, new SecretRedactor(workdir));
        const events: any[] = [];

        await agent.run("issue", { onIteration: (event) => events.push(event) });

        expect(events).toHaveLength(2);
        expect(events[0].iteration).toBe(1);
        expect(events[0].action.type).toBe("run_command");
        expect(events[0].observation).toContain("hi");
        expect(events[1].iteration).toBe(2);
        expect(events[1].action.type).toBe("done");
        expect(events[1].observation).toBeUndefined();
    });

    it("run() works fine with no onIteration callback given at all", async () => {
        const { service } = fakeAiService([jsonAction({ type: "done", summary: "ok" })]);
        const agent = new AgentLoop(service, knowledge, workdir, new SecretRedactor(workdir));

        await expect(agent.run("issue")).resolves.toBeTruthy();
    });
});

describe("AgentLoop — cancellation", () => {
    let workdir: string;
    const knowledge = new FrameworkKnowledge();

    beforeEach(async () => {
        workdir = await fs.mkdtemp(path.join(os.tmpdir(), "nyala-agent-loop-abort-"));
    });

    afterEach(async () => {
        await fs.remove(workdir);
    });

    it("stops before the next iteration when the signal is already aborted", async () => {
        const { service, completeSpy } = fakeAiService([
            jsonAction({ type: "run_command", args: { command: "true" } }),
            jsonAction({ type: "done", summary: "done" }),
        ]);
        const agent = new AgentLoop(service, knowledge, workdir, new SecretRedactor(workdir));
        const controller = new AbortController();
        controller.abort();

        await expect(agent.run("issue", { signal: controller.signal })).rejects.toThrow(/aborted/);
        expect(completeSpy).not.toHaveBeenCalled();
    });

    it("the thrown error is identifiable as an abort (name === 'AbortError')", async () => {
        const { service } = fakeAiService([jsonAction({ type: "done", summary: "done" })]);
        const agent = new AgentLoop(service, knowledge, workdir, new SecretRedactor(workdir));
        const controller = new AbortController();
        controller.abort();

        try {
            await agent.run("issue", { signal: controller.signal });
            expect.unreachable("should have thrown");
        } catch (error) {
            expect((error as Error).name).toBe("AbortError");
        }
    });

    it("aborting between iterations lets the first iteration finish before stopping", async () => {
        const { service, completeSpy } = fakeAiService([
            jsonAction({ type: "run_command", args: { command: "true" } }),
            jsonAction({ type: "run_command", args: { command: "true" } }),
            jsonAction({ type: "done", summary: "done" }),
        ]);
        const agent = new AgentLoop(service, knowledge, workdir, new SecretRedactor(workdir));
        const controller = new AbortController();

        await expect(
            agent.run("issue", {
                signal: controller.signal,
                onIteration: () => controller.abort(), // abort right after the first iteration completes
            })
        ).rejects.toThrow(/aborted/);

        expect(completeSpy).toHaveBeenCalledTimes(1); // second iteration never started
    });

    it("does not abort when no signal is given at all", async () => {
        const { service } = fakeAiService([jsonAction({ type: "done", summary: "ok" })]);
        const agent = new AgentLoop(service, knowledge, workdir, new SecretRedactor(workdir));

        await expect(agent.run("issue")).resolves.toBeTruthy();
    });
});

describe("AgentLoop — usage collection", () => {
    let workdir: string;
    const knowledge = new FrameworkKnowledge();

    beforeEach(async () => {
        workdir = await fs.mkdtemp(path.join(os.tmpdir(), "nyala-agent-loop-usage-"));
    });

    afterEach(async () => {
        await fs.remove(workdir);
    });

    it("collects usage from every completion call that reports it", async () => {
        const { service } = fakeAiServiceWithUsage([
            { text: jsonAction({ type: "run_command", args: { command: "true" } }), usage: { inputTokens: 100, outputTokens: 20 } },
            { text: jsonAction({ type: "done", summary: "done" }), usage: { inputTokens: 150, outputTokens: 10 } },
        ]);
        const agent = new AgentLoop(service, knowledge, workdir, new SecretRedactor(workdir));

        const result = await agent.run("issue");

        expect(result.usage).toEqual([
            { inputTokens: 100, outputTokens: 20 },
            { inputTokens: 150, outputTokens: 10 },
        ]);
    });

    it("usage is an empty array, not an error, when the provider never reports it", async () => {
        const { service } = fakeAiService([jsonAction({ type: "done", summary: "ok" })]);
        const agent = new AgentLoop(service, knowledge, workdir, new SecretRedactor(workdir));

        const result = await agent.run("issue");

        expect(result.usage).toEqual([]);
    });

    it("partial reporting is handled — some calls have usage, some don't", async () => {
        const { service } = fakeAiServiceWithUsage([
            { text: jsonAction({ type: "run_command", args: { command: "true" } }) }, // no usage this call
            { text: jsonAction({ type: "done", summary: "done" }), usage: { inputTokens: 50, outputTokens: 5 } },
        ]);
        const agent = new AgentLoop(service, knowledge, workdir, new SecretRedactor(workdir));

        const result = await agent.run("issue");

        expect(result.usage).toEqual([{ inputTokens: 50, outputTokens: 5 }]);
    });
});

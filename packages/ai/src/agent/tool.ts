import { SecretRedactor } from "../security/redaction";

export interface ToolContext {
    workdir: string;
    redactor: SecretRedactor;
    commandTimeoutMs: number;
}

export interface ToolResult {
    output: string;
}

/**
 * A single capability the agent loop can invoke. Deliberately the same
 * shape MCP and native provider tool-calling both use (name + JSON-schema-
 * shaped arguments) — not because MCP support exists yet, but so that when
 * it does, an McpToolSource can adapt a remote tool into this shape without
 * this interface needing to change. See ARCHITECTURE.md.
 */
export interface Tool {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
    execute(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult>;
}

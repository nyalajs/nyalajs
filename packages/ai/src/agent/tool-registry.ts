import { Tool } from "./tool";

/**
 * What AgentLoop dispatches actions against instead of a hardcoded switch.
 * This — not a new AgentLoop rewrite — is what a third-party tool (or a
 * future MCP adapter) plugs into.
 */
export class ToolRegistry {
    private readonly tools = new Map<string, Tool>();

    register(tool: Tool): void {
        this.tools.set(tool.name, tool);
    }

    get(name: string): Tool | undefined {
        return this.tools.get(name);
    }

    list(): Tool[] {
        return [...this.tools.values()];
    }
}

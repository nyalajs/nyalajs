import { describe, it, expect } from "vitest";
import { FrameworkKnowledge } from "../knowledge/framework-knowledge";

describe("FrameworkKnowledge", () => {
    const knowledge = new FrameworkKnowledge();

    it("every section returns non-empty content", () => {
        for (const [name, content] of Object.entries(knowledge.getAll())) {
            expect(content.length, `${name} should not be empty`).toBeGreaterThan(0);
        }
    });

    it("DI conventions explicitly rule out the ServiceProvider pattern common in adjacent frameworks", () => {
        expect(knowledge.getDependencyInjection()).toMatch(/no.*ServiceProvider/i);
    });

    it("DI conventions describe type-based, not decorator-token-based, constructor injection", () => {
        const text = knowledge.getDependencyInjection();
        expect(text).toContain("design:paramtypes");
        expect(text).toContain("@Injectable()");
    });

    it("tenancy conventions describe the fail-closed, AsyncLocalStorage-based model, not a naive per-request field", () => {
        const text = knowledge.getTenancyConventions();
        expect(text).toContain("TenantContext");
        expect(text).toMatch(/fail-closed/i);
        expect(text).toMatch(/singleton/i);
    });

    it("CLI conventions are honest about incomplete generator stubs", () => {
        expect(knowledge.getCliConventions()).toMatch(/stub/i);
    });

    it("module structure names the real bootstrap convention", () => {
        expect(knowledge.getModuleStructure()).toContain("bootstrap/app.module.ts");
    });

    it("asPromptBlock() renders every section under its own heading", () => {
        const block = knowledge.asPromptBlock();
        for (const name of Object.keys(knowledge.getAll())) {
            expect(block).toContain(`## ${name}`);
        }
    });

    it("getAll() and the individual getters return identical content", () => {
        const all = knowledge.getAll();
        expect(all.tenancy).toBe(knowledge.getTenancyConventions());
        expect(all.dependencyInjection).toBe(knowledge.getDependencyInjection());
    });
});

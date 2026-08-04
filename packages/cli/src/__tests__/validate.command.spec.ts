import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "fs-extra";
import * as path from "path";
import * as os from "os";
import { ValidateCommand } from "../commands/validate.command";

describe("ValidateCommand — circular dependency detection", () => {
    let tmpDir: string;

    beforeEach(async () => {
        tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "nyala-validate-"));
    });

    afterEach(async () => {
        await fs.remove(tmpDir);
        vi.restoreAllMocks();
    });

    async function writeAppFile(relPath: string, content: string) {
        const full = path.join(tmpDir, "app", relPath);
        await fs.ensureDir(path.dirname(full));
        await fs.writeFile(full, content);
    }

    function spyOnExitAndLog() {
        const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);
        const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
        return { exitSpy, logSpy };
    }

    it("passes when there is no cycle", async () => {
        await writeAppFile("a.ts", `import { b } from "./b";\nexport const a = 1;`);
        await writeAppFile("b.ts", `export const b = 1;`);

        const { exitSpy, logSpy } = spyOnExitAndLog();
        await new ValidateCommand(tmpDir).execute();

        expect(exitSpy).not.toHaveBeenCalled();
        expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("No architecture violations found"));
    });

    it("detects a direct two-file cycle", async () => {
        await writeAppFile("a.ts", `import { b } from "./b";\nexport const a = 1;`);
        await writeAppFile("b.ts", `import { a } from "./a";\nexport const b = 1;`);

        const { exitSpy, logSpy } = spyOnExitAndLog();
        await new ValidateCommand(tmpDir).execute();

        expect(exitSpy).toHaveBeenCalledWith(1);
        const printed = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
        expect(printed).toMatch(/Circular dependency/);
        expect(printed).toMatch(/a\.ts/);
        expect(printed).toMatch(/b\.ts/);
    });

    it("detects a longer three-file cycle", async () => {
        await writeAppFile("a.ts", `import { b } from "./b";\nexport const a = 1;`);
        await writeAppFile("b.ts", `import { c } from "./c";\nexport const b = 1;`);
        await writeAppFile("c.ts", `import { a } from "./a";\nexport const c = 1;`);

        const { exitSpy } = spyOnExitAndLog();
        await new ValidateCommand(tmpDir).execute();

        expect(exitSpy).toHaveBeenCalledWith(1);
    });

    it("resolves imports of a directory's index.ts", async () => {
        await writeAppFile("a.ts", `import { b } from "./sub";\nexport const a = 1;`);
        await writeAppFile("sub/index.ts", `import { a } from "../a";\nexport const b = 1;`);

        const { exitSpy } = spyOnExitAndLog();
        await new ValidateCommand(tmpDir).execute();

        expect(exitSpy).toHaveBeenCalledWith(1);
    });

    it("does not flag imports of external packages", async () => {
        await writeAppFile("a.ts", `import { z } from "zod";\nexport const a = 1;`);

        const { exitSpy } = spyOnExitAndLog();
        await new ValidateCommand(tmpDir).execute();

        expect(exitSpy).not.toHaveBeenCalled();
    });

    it("does not flag a diamond-shaped (non-circular) import graph", async () => {
        // a -> b, a -> c, b -> d, c -> d (no cycle, just a shared dependency)
        await writeAppFile("a.ts", `import { b } from "./b";\nimport { c } from "./c";`);
        await writeAppFile("b.ts", `import { d } from "./d";`);
        await writeAppFile("c.ts", `import { d } from "./d";`);
        await writeAppFile("d.ts", `export const d = 1;`);

        const { exitSpy } = spyOnExitAndLog();
        await new ValidateCommand(tmpDir).execute();

        expect(exitSpy).not.toHaveBeenCalled();
    });

    it("reports each cycle only once even when reachable from multiple files", async () => {
        // entry -> a -> b -> a (cycle), plus entry also imports b directly
        await writeAppFile("entry.ts", `import { a } from "./a";\nimport { b } from "./b";`);
        await writeAppFile("a.ts", `import { b } from "./b";`);
        await writeAppFile("b.ts", `import { a } from "./a";`);

        const { logSpy } = spyOnExitAndLog();
        await new ValidateCommand(tmpDir).execute();

        const printed = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
        const cycleMentions = (printed.match(/Circular dependency/g) || []).length;
        expect(cycleMentions).toBe(1);
    });
});

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "fs-extra";
import * as path from "path";
import * as os from "os";
import { EventEmitter } from "events";
import { ViteDevCommand } from "../commands/vite-dev.command";

const spawnMock = vi.fn();

// vi.mock calls are hoisted above imports by vitest, so ViteDevCommand's
// own `import { spawn } from "child_process"` picks up this mock despite
// this call appearing textually after the import above.
vi.mock("child_process", () => ({
    spawn: (...args: unknown[]) => spawnMock(...args),
}));

function fakeChildProcess() {
    const emitter = new EventEmitter() as any;
    emitter.kill = vi.fn();
    return emitter;
}

describe("ViteDevCommand", () => {
    let tmpDir: string;

    beforeEach(async () => {
        tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "nyala-vite-dev-"));
        spawnMock.mockReset();
        spawnMock.mockReturnValue(fakeChildProcess());
    });

    afterEach(async () => {
        await fs.remove(tmpDir);
    });

    it("is a no-op (returns null, spawns nothing) when there's no vite.config.ts", async () => {
        const child = await new ViteDevCommand(tmpDir).start(5173);

        expect(child).toBeNull();
        expect(spawnMock).not.toHaveBeenCalled();
    });

    it("detects vite.config.ts and starts a child process on the given port", async () => {
        await fs.writeFile(path.join(tmpDir, "vite.config.ts"), "export default {}");

        const child = await new ViteDevCommand(tmpDir).start(5174);

        expect(child).not.toBeNull();
        expect(spawnMock).toHaveBeenCalledWith(
            "npx",
            ["vite", "--port", "5174", "--strictPort"],
            expect.objectContaining({
                cwd: tmpDir,
                env: expect.objectContaining({ NYALA_VITE_DEV: "true" }),
            })
        );
    });

    it("detects vite.config.js as an alternative to vite.config.ts", async () => {
        await fs.writeFile(path.join(tmpDir, "vite.config.js"), "module.exports = {}");

        const child = await new ViteDevCommand(tmpDir).start(5175);

        expect(child).not.toBeNull();
        expect(spawnMock).toHaveBeenCalledTimes(1);
    });
});

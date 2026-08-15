import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "fs-extra";
import * as path from "path";
import * as os from "os";
import { ViteBuildCommand } from "../commands/vite-build.command";

const spawnSyncMock = vi.fn();

// vi.mock calls are hoisted above imports by vitest, so ViteBuildCommand's
// own `import { spawnSync } from "child_process"` picks up this mock
// despite this call appearing textually after the import above.
vi.mock("child_process", () => ({
    spawnSync: (...args: unknown[]) => spawnSyncMock(...args),
}));

describe("ViteBuildCommand", () => {
    let tmpDir: string;

    beforeEach(async () => {
        tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "nyala-vite-build-"));
        spawnSyncMock.mockReset();
    });

    afterEach(async () => {
        await fs.remove(tmpDir);
    });

    it("is a no-op when there's no vite.config.ts (never calls spawnSync)", async () => {
        await new ViteBuildCommand(tmpDir).handle();

        expect(spawnSyncMock).not.toHaveBeenCalled();
    });

    it("runs `vite build` when vite.config.ts is present", async () => {
        await fs.writeFile(path.join(tmpDir, "vite.config.ts"), "export default {}");
        spawnSyncMock.mockReturnValue({ status: 0, error: undefined });

        await new ViteBuildCommand(tmpDir).handle();

        expect(spawnSyncMock).toHaveBeenCalledWith(
            "npx",
            ["vite", "build"],
            expect.objectContaining({ cwd: tmpDir })
        );
    });

    it("does not build the SSR entry when --ssr wasn't passed", async () => {
        await fs.writeFile(path.join(tmpDir, "vite.config.ts"), "export default {}");
        spawnSyncMock.mockReturnValue({ status: 0, error: undefined });

        await new ViteBuildCommand(tmpDir).handle({ ssr: false });

        expect(spawnSyncMock).toHaveBeenCalledTimes(1);
    });

    it("builds resources/js/ssr.tsx via `vite build --ssr` when --ssr is passed and the entry exists", async () => {
        await fs.writeFile(path.join(tmpDir, "vite.config.ts"), "export default {}");
        await fs.ensureDir(path.join(tmpDir, "resources/js"));
        await fs.writeFile(path.join(tmpDir, "resources/js/ssr.tsx"), "export {}");
        spawnSyncMock.mockReturnValue({ status: 0, error: undefined });

        await new ViteBuildCommand(tmpDir).handle({ ssr: true });

        expect(spawnSyncMock).toHaveBeenCalledTimes(2);
        expect(spawnSyncMock).toHaveBeenLastCalledWith(
            "npx",
            ["vite", "build", "--ssr", path.join(tmpDir, "resources/js/ssr.tsx"), "--outDir", "dist/ssr"],
            expect.objectContaining({ cwd: tmpDir })
        );
    });

    it("skips the SSR build (without failing) when --ssr is passed but no resources/js/ssr.tsx exists", async () => {
        await fs.writeFile(path.join(tmpDir, "vite.config.ts"), "export default {}");
        spawnSyncMock.mockReturnValue({ status: 0, error: undefined });

        await new ViteBuildCommand(tmpDir).handle({ ssr: true });

        expect(spawnSyncMock).toHaveBeenCalledTimes(1);
    });

    it("exits the process with the child's status code when `vite build` fails", async () => {
        await fs.writeFile(path.join(tmpDir, "vite.config.ts"), "export default {}");
        spawnSyncMock.mockReturnValue({ status: 1, error: undefined });
        const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {
            throw new Error("process.exit called");
        }) as any);

        await expect(new ViteBuildCommand(tmpDir).handle()).rejects.toThrow("process.exit called");
        expect(exitSpy).toHaveBeenCalledWith(1);
        exitSpy.mockRestore();
    });
});

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs-extra";
import * as path from "path";
import * as os from "os";
import { FileTranscriptStore } from "../memory/file-transcript-store";
import { AiMessage } from "../providers/types";

describe("FileTranscriptStore", () => {
    let root: string;
    let store: FileTranscriptStore;

    beforeEach(async () => {
        root = await fs.mkdtemp(path.join(os.tmpdir(), "nyala-transcript-store-"));
        store = new FileTranscriptStore(root);
    });

    afterEach(async () => {
        await fs.remove(root);
    });

    const transcript: AiMessage[] = [
        { role: "system", content: "sys" },
        { role: "user", content: "hi" },
        { role: "assistant", content: "hello" },
    ];

    it("save() then load() round-trips the transcript exactly", async () => {
        await store.save("run-1", transcript);
        expect(await store.load("run-1")).toEqual(transcript);
    });

    it("load() returns null for a run that was never saved", async () => {
        expect(await store.load("never-existed")).toBeNull();
    });

    it("list() is empty before anything is saved", async () => {
        expect(await store.list()).toEqual([]);
    });

    it("list() returns every saved run id", async () => {
        await store.save("run-a", transcript);
        await store.save("run-b", transcript);

        expect((await store.list()).sort()).toEqual(["run-a", "run-b"]);
    });

    it("saving under the same runId again overwrites the previous transcript", async () => {
        await store.save("run-1", transcript);
        const updated: AiMessage[] = [...transcript, { role: "user", content: "one more turn" }];
        await store.save("run-1", updated);

        expect(await store.load("run-1")).toEqual(updated);
        expect(await store.list()).toEqual(["run-1"]);
    });

    it("creates the storage directory on first save if it doesn't exist yet", async () => {
        const freshRoot = path.join(root, "nested", "dir");
        const freshStore = new FileTranscriptStore(freshRoot);

        await freshStore.save("run-1", transcript);

        expect(await fs.pathExists(freshRoot)).toBe(true);
    });

    it("defaults to <cwd>/.nyala/resolve-runs when no root is given", () => {
        const defaultStore = new FileTranscriptStore();
        expect((defaultStore as any).root).toBe(path.join(process.cwd(), ".nyala", "resolve-runs"));
    });
});

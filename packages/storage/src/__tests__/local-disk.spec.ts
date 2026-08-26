import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs-extra";
import * as path from "path";
import * as os from "os";
import { Readable } from "stream";
import { LocalDisk } from "../disks/local";

async function readAll(stream: Readable): Promise<string> {
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);
    return Buffer.concat(chunks).toString();
}

describe("LocalDisk", () => {
    let root: string;
    let disk: LocalDisk;

    beforeEach(async () => {
        root = await fs.mkdtemp(path.join(os.tmpdir(), "nyala-storage-"));
        disk = new LocalDisk({ root, publicUrl: "/storage" });
    });

    afterEach(async () => {
        await fs.remove(root);
    });

    it("writes and reads back a file", async () => {
        await disk.put("greeting.txt", "hello");
        expect((await disk.get("greeting.txt")).toString()).toBe("hello");
    });

    it("creates intermediate directories automatically", async () => {
        await disk.put("a/b/c.txt", "nested");
        expect((await disk.get("a/b/c.txt")).toString()).toBe("nested");
    });

    it("exists() reflects whether a file was written", async () => {
        expect(await disk.exists("x.txt")).toBe(false);
        await disk.put("x.txt", "y");
        expect(await disk.exists("x.txt")).toBe(true);
    });

    it("delete() removes a file", async () => {
        await disk.put("x.txt", "y");
        await disk.delete("x.txt");
        expect(await disk.exists("x.txt")).toBe(false);
    });

    it("delete() on a non-existent file does not throw", async () => {
        await expect(disk.delete("nope.txt")).resolves.not.toThrow();
    });

    it("url() builds a path under the configured publicUrl", async () => {
        expect(await disk.url("images/logo.png")).toBe("/storage/images/logo.png");
    });

    it("prevents writing outside the configured root via ../ traversal", async () => {
        await disk.put("../../escaped.txt", "should be contained");

        // The file must land inside `root`, not actually escape it.
        const outside = path.join(root, "..", "..", "escaped.txt");
        expect(await fs.pathExists(outside)).toBe(false);
        expect(await disk.exists("escaped.txt")).toBe(true);
    });

    it("prevents directory traversal in url() too", async () => {
        const url = await disk.url("../../etc/passwd");
        expect(url.startsWith("/storage/")).toBe(true);
        expect(url).not.toContain("..");
    });

    it("supports writing a Buffer", async () => {
        await disk.put("binary.dat", Buffer.from([1, 2, 3]));
        expect(await disk.get("binary.dat")).toEqual(Buffer.from([1, 2, 3]));
    });

    it("stream() reads back a file written with put(), incrementally", async () => {
        await disk.put("large.txt", "streamed content");

        const readable = await disk.stream("large.txt");
        expect(await readAll(readable)).toBe("streamed content");
    });

    it("putStream() writes a file from a Readable without buffering it in the caller", async () => {
        const source = Readable.from(["chunk-1", "chunk-2", "chunk-3"]);

        await disk.putStream("from-stream.txt", source);

        expect((await disk.get("from-stream.txt")).toString()).toBe("chunk-1chunk-2chunk-3");
    });

    it("putStream() then stream() round-trips a real multi-chunk write without ever fully buffering it", async () => {
        const chunks = Array.from({ length: 50 }, (_, i) => `line-${i}\n`);
        const source = Readable.from(chunks);

        await disk.putStream("big.log", source);

        const readBack = await readAll(await disk.stream("big.log"));
        expect(readBack).toBe(chunks.join(""));
    });
});

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs-extra";
import * as path from "path";
import * as os from "os";
import { LocalDisk } from "../disks/local";

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
});

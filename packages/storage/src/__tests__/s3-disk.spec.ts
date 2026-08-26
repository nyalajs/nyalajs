import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { Readable } from "stream";
import { S3Disk } from "../disks/s3";

async function readAll(stream: Readable): Promise<string> {
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);
    return Buffer.concat(chunks).toString();
}

describe("S3Disk", () => {
    describe("url() construction (no SDK/network needed)", () => {
        const disk = new S3Disk({
            region: "us-east-1",
            bucket: "my-bucket",
            credentials: { accessKeyId: "x", secretAccessKey: "y" },
        });

        it("constructs a standard S3 URL", async () => {
            expect(await disk.url("images/logo.png")).toBe(
                "https://my-bucket.s3.us-east-1.amazonaws.com/images/logo.png"
            );
        });

        it("uses a custom endpoint when configured (e.g. for S3-compatible services)", async () => {
            const customDisk = new S3Disk({
                region: "auto",
                bucket: "my-bucket",
                endpoint: "https://r2.example.com",
                credentials: { accessKeyId: "x", secretAccessKey: "y" },
            });

            expect(await customDisk.url("f.txt")).toBe("https://r2.example.com/my-bucket/f.txt");
        });
    });

    describe("when @aws-sdk/client-s3 is not installed", () => {
        beforeAll(() => {
            vi.doMock("@aws-sdk/client-s3", () => {
                throw new Error("Cannot find module '@aws-sdk/client-s3'");
            });
        });

        afterAll(() => {
            vi.doUnmock("@aws-sdk/client-s3");
        });

        it("put() throws a clear install hint instead of a raw module-not-found error", async () => {
            const disk = new S3Disk({
                region: "us-east-1",
                bucket: "my-bucket",
                credentials: { accessKeyId: "x", secretAccessKey: "y" },
            });

            await expect(disk.put("f.txt", "data")).rejects.toThrow(
                /@aws-sdk\/client-s3 is required.*npm install @aws-sdk\/client-s3/
            );
        });

        it("get() throws the same clear error", async () => {
            const disk = new S3Disk({
                region: "us-east-1",
                bucket: "my-bucket",
                credentials: { accessKeyId: "x", secretAccessKey: "y" },
            });

            await expect(disk.get("f.txt")).rejects.toThrow(/@aws-sdk\/client-s3/);
        });
    });

    // Real S3-compatible backend (MinIO), not a mock — proves put/get/stream/
    // putStream/exists/delete actually work against a real service, not
    // just that the SDK calls were shaped correctly.
    describe("against a real S3-compatible backend (MinIO)", () => {
        const disk = new S3Disk({
            region: "us-east-1",
            bucket: "nyala-test-bucket",
            endpoint: "http://127.0.0.1:9100",
            forcePathStyle: true,
            credentials: { accessKeyId: "minioadmin", secretAccessKey: "minioadmin" },
        });

        it("writes and reads back a file", async () => {
            await disk.put("greeting.txt", "hello from minio");
            expect((await disk.get("greeting.txt")).toString()).toBe("hello from minio");
        });

        it("exists() reflects whether an object was written", async () => {
            expect(await disk.exists("does-not-exist.txt")).toBe(false);
            await disk.put("exists-check.txt", "y");
            expect(await disk.exists("exists-check.txt")).toBe(true);
        });

        it("delete() removes an object", async () => {
            await disk.put("to-delete.txt", "y");
            await disk.delete("to-delete.txt");
            expect(await disk.exists("to-delete.txt")).toBe(false);
        });

        it("stream() reads back a file incrementally, not fully buffered up front", async () => {
            await disk.put("streamed-read.txt", "streamed content from minio");

            const readable = await disk.stream("streamed-read.txt");
            expect(await readAll(readable)).toBe("streamed content from minio");
        });

        it("putStream() uploads from a Readable, and the result round-trips through get()", async () => {
            const source = Readable.from(["part-1-", "part-2-", "part-3"]);

            await disk.putStream("uploaded-stream.txt", source);

            expect((await disk.get("uploaded-stream.txt")).toString()).toBe("part-1-part-2-part-3");
        });

        it("putStream() then stream() round-trips a real multi-chunk upload", async () => {
            const lines = Array.from({ length: 30 }, (_, i) => `row-${i}\n`);
            const source = Readable.from(lines);

            await disk.putStream("big-upload.log", source);

            const readBack = await readAll(await disk.stream("big-upload.log"));
            expect(readBack).toBe(lines.join(""));
        });
    });
});

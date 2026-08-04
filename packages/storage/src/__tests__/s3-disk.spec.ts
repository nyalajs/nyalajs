import { describe, it, expect } from "vitest";
import { S3Disk } from "../disks/s3";

describe("S3Disk (no @aws-sdk/client-s3 installed in this environment)", () => {
    const disk = new S3Disk({
        region: "us-east-1",
        bucket: "my-bucket",
        credentials: { accessKeyId: "x", secretAccessKey: "y" },
    });

    it("put() throws a clear install hint instead of a raw module-not-found error", async () => {
        await expect(disk.put("f.txt", "data")).rejects.toThrow(
            /@aws-sdk\/client-s3 is required.*npm install @aws-sdk\/client-s3/
        );
    });

    it("get() throws the same clear error", async () => {
        await expect(disk.get("f.txt")).rejects.toThrow(/@aws-sdk\/client-s3/);
    });

    it("url() constructs a standard S3 URL without needing the SDK at all", async () => {
        expect(await disk.url("images/logo.png")).toBe(
            "https://my-bucket.s3.us-east-1.amazonaws.com/images/logo.png"
        );
    });

    it("url() uses a custom endpoint when configured (e.g. for S3-compatible services)", async () => {
        const customDisk = new S3Disk({
            region: "auto",
            bucket: "my-bucket",
            endpoint: "https://r2.example.com",
            credentials: { accessKeyId: "x", secretAccessKey: "y" },
        });

        expect(await customDisk.url("f.txt")).toBe("https://r2.example.com/my-bucket/f.txt");
    });
});

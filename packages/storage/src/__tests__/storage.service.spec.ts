import { describe, it, expect, vi } from "vitest";
import { StorageService } from "../storage.service";
import { StorageDisk } from "../storage.interface";

function fakeDisk(label: string): StorageDisk {
    return {
        put: vi.fn().mockResolvedValue(undefined),
        get: vi.fn().mockResolvedValue(Buffer.from(label)),
        delete: vi.fn().mockResolvedValue(undefined),
        exists: vi.fn().mockResolvedValue(true),
        url: vi.fn().mockResolvedValue(`https://${label}/x`),
    };
}

describe("StorageService", () => {
    it("connect() with no config still provides a default local disk", () => {
        const service = new StorageService();
        service.connect();

        expect(() => service.disk("local")).not.toThrow();
    });

    it("disk(name) returns the named disk from config", () => {
        const service = new StorageService();
        const s3 = fakeDisk("s3");
        service.connect({ default: "s3", disks: { s3 } });

        expect(service.disk("s3")).toBe(s3);
    });

    it("disk() with no argument returns the configured default disk", () => {
        const service = new StorageService();
        const s3 = fakeDisk("s3");
        service.connect({ default: "s3", disks: { s3 } });

        expect(service.disk()).toBe(s3);
    });

    it("disk() throws a clear error for an unconfigured disk name", () => {
        const service = new StorageService();
        service.connect();

        expect(() => service.disk("does-not-exist")).toThrow(/not configured/);
    });

    it("delegates put/get/delete/exists/url to the default disk", async () => {
        const service = new StorageService();
        const s3 = fakeDisk("s3");
        service.connect({ default: "s3", disks: { s3 } });

        await service.put("f.txt", "data");
        await service.get("f.txt");
        await service.delete("f.txt");
        await service.exists("f.txt");
        await service.url("f.txt");

        expect(s3.put).toHaveBeenCalledWith("f.txt", "data");
        expect(s3.get).toHaveBeenCalledWith("f.txt");
        expect(s3.delete).toHaveBeenCalledWith("f.txt");
        expect(s3.exists).toHaveBeenCalledWith("f.txt");
        expect(s3.url).toHaveBeenCalledWith("f.txt");
    });
});

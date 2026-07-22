import { Injectable } from "@nyalajs/core";
import { StorageDisk } from "./storage.interface";
import { LocalDisk } from "./disks/local";

export interface StorageConfig {
    default: string;
    disks: Record<string, StorageDisk>;
}

@Injectable()
export class StorageService implements StorageDisk {
    private defaultDisk: string = "local";
    private disks: Map<string, StorageDisk> = new Map();

    connect(config?: StorageConfig) {
        if (config) {
            this.defaultDisk = config.default;
            for (const [name, disk] of Object.entries(config.disks)) {
                this.disks.set(name, disk);
            }
        }
        
        // Ensure there's always a default local disk if none configured
        if (!this.disks.has("local")) {
            this.disks.set("local", new LocalDisk());
        }
    }

    /**
     * Get a specific storage disk.
     */
    disk(name?: string): StorageDisk {
        const diskName = name || this.defaultDisk;
        const disk = this.disks.get(diskName);
        if (!disk) {
            throw new Error(`[nyala/storage] Disk [${diskName}] is not configured.`);
        }
        return disk;
    }

    // --- Delegate to default disk ---

    async put(path: string, contents: string | Buffer): Promise<void> {
        return this.disk().put(path, contents);
    }

    async get(path: string): Promise<Buffer> {
        return this.disk().get(path);
    }

    async delete(path: string): Promise<void> {
        return this.disk().delete(path);
    }

    async exists(path: string): Promise<boolean> {
        return this.disk().exists(path);
    }

    async url(path: string): Promise<string> {
        return this.disk().url(path);
    }
}

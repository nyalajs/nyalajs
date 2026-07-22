import * as fs from "fs-extra";
import * as path from "path";
import { StorageDisk } from "../storage.interface";

export class LocalDisk implements StorageDisk {
    private root: string;
    private publicUrl: string;

    constructor(config: { root?: string; publicUrl?: string } = {}) {
        this.root = config.root ?? path.join(process.cwd(), "storage/app/public");
        this.publicUrl = config.publicUrl ?? "/storage";
    }

    private getFullPath(relativePath: string): string {
        // Prevent directory traversal
        const safePath = path.normalize(relativePath).replace(/^(\.\.(\/|\\|$))+/, "");
        return path.join(this.root, safePath);
    }

    async put(filePath: string, contents: string | Buffer): Promise<void> {
        const fullPath = this.getFullPath(filePath);
        await fs.ensureDir(path.dirname(fullPath));
        await fs.writeFile(fullPath, contents);
    }

    async get(filePath: string): Promise<Buffer> {
        return fs.readFile(this.getFullPath(filePath));
    }

    async delete(filePath: string): Promise<void> {
        const fullPath = this.getFullPath(filePath);
        if (await fs.pathExists(fullPath)) {
            await fs.unlink(fullPath);
        }
    }

    async exists(filePath: string): Promise<boolean> {
        return fs.pathExists(this.getFullPath(filePath));
    }

    async url(filePath: string): Promise<string> {
        // Prevent directory traversal for URLs too
        const safePath = path.normalize(filePath).replace(/^(\.\.(\/|\\|$))+/, "");
        // Normalize slashes for web
        return `${this.publicUrl}/${safePath}`.replace(/\\/g, "/").replace(/(?<!:)\/\//g, "/");
    }
}

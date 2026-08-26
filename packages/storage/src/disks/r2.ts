import { Readable } from "stream";
import { StorageDisk } from "../storage.interface";
import { S3Disk } from "./s3";

export interface R2Config {
    /** Your Cloudflare account ID (Dashboard → R2 → Overview, or the URL of any R2 page). Used to build the endpoint. */
    accountId: string;
    bucket: string;
    /** R2 API tokens with "Object Read & Write" (or narrower) permissions — created under R2 → Manage R2 API Tokens, not your global Cloudflare API key. */
    credentials: {
        accessKeyId: string;
        secretAccessKey: string;
    };
    /**
     * The public URL to serve reads through, used by url(). R2 has no
     * account-derivable public URL the way S3 has `<bucket>.s3.<region>.amazonaws.com`
     * — a bucket's public access is either off, or explicitly assigned a
     * `pub-<hash>.r2.dev` hostname (dashboard → bucket → Settings → Public
     * Access) or a custom domain you attach. Pass whichever one applies;
     * omit it if you never call url() (e.g. you serve files by proxying
     * disk.stream() through your own app instead of a direct public link).
     */
    publicUrl?: string;
}

/**
 * Cloudflare R2, via its S3-compatible API — a thin config wrapper around
 * S3Disk, not a separate implementation: R2 speaks the same S3 API
 * (put/get/delete/head), just at a different endpoint and with a region
 * that's always "auto". See https://developers.cloudflare.com/r2/api/s3/api/
 *
 * @example
 *   const disk = new R2Disk({
 *     accountId: process.env.R2_ACCOUNT_ID!,
 *     bucket: "uploads",
 *     credentials: {
 *       accessKeyId: process.env.R2_ACCESS_KEY_ID!,
 *       secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
 *     },
 *     publicUrl: "https://pub-1a2b3c4d5e6f.r2.dev", // or your custom domain
 *   });
 *
 *   await disk.put("avatars/1.png", buffer);
 *   await disk.url("avatars/1.png"); // "https://pub-.../avatars/1.png"
 */
export class R2Disk implements StorageDisk {
    private readonly s3: S3Disk;
    private readonly publicUrl?: string;

    constructor(config: R2Config) {
        this.publicUrl = config.publicUrl;
        this.s3 = new S3Disk({
            region: "auto",
            bucket: config.bucket,
            endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
            credentials: config.credentials,
            // R2 supports virtual-hosted style too, but path-style is the
            // more universally compatible default (matches what Cloudflare's
            // own setup guides and every S3-compatible client recommend for R2).
            forcePathStyle: true,
        });
    }

    put(filePath: string, contents: string | Buffer): Promise<void> {
        return this.s3.put(filePath, contents);
    }

    putStream(filePath: string, contents: Readable): Promise<void> {
        return this.s3.putStream(filePath, contents);
    }

    get(filePath: string): Promise<Buffer> {
        return this.s3.get(filePath);
    }

    stream(filePath: string): Promise<Readable> {
        return this.s3.stream(filePath);
    }

    delete(filePath: string): Promise<void> {
        return this.s3.delete(filePath);
    }

    exists(filePath: string): Promise<boolean> {
        return this.s3.exists(filePath);
    }

    async url(filePath: string): Promise<string> {
        if (!this.publicUrl) {
            throw new Error(
                "[nyala/storage] R2Disk.url() needs `publicUrl` set — R2 has no account-derivable public URL. " +
                    "Enable public access on the bucket (dashboard → bucket → Settings → Public Access) to get a " +
                    "pub-<hash>.r2.dev URL, or attach a custom domain, then pass it as R2Config.publicUrl."
            );
        }
        return `${this.publicUrl}/${filePath}`.replace(/(?<!:)\/\//g, "/");
    }
}

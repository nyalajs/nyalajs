import { Readable } from "stream";

export interface StorageDisk {
    /**
     * Store a file on the disk.
     */
    put(path: string, contents: string | Buffer): Promise<void>;

    /**
     * Store a file on the disk from a stream, without buffering the whole
     * thing into memory first — for large uploads (video, big CSV exports,
     * proxied request bodies).
     */
    putStream(path: string, contents: Readable): Promise<void>;

    /**
     * Retrieve a file's contents from the disk, fully buffered into memory.
     * Fine for small files (config, thumbnails); for anything that might be
     * large, use stream() instead — get() loads the entire file into RAM
     * before returning.
     */
    get(path: string): Promise<Buffer>;

    /**
     * Retrieve a file as a Readable — the streaming counterpart to get().
     * Use this to serve downloads (pair with @nyalajs/http's
     * StreamableResponse) or pipe a large file elsewhere without ever
     * holding the whole thing in memory at once.
     */
    stream(path: string): Promise<Readable>;

    /**
     * Delete a file from the disk.
     */
    delete(path: string): Promise<void>;

    /**
     * Determine if a file exists on the disk.
     */
    exists(path: string): Promise<boolean>;

    /**
     * Get the publicly accessible URL for a given path.
     */
    url(path: string): Promise<string>;
}

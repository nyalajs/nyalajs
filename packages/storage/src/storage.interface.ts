export interface StorageDisk {
    /**
     * Store a file on the disk.
     */
    put(path: string, contents: string | Buffer): Promise<void>;

    /**
     * Retrieve a file's contents from the disk.
     */
    get(path: string): Promise<Buffer>;

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

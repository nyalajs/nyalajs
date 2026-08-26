import { Readable } from "stream";
import { StorageDisk } from "../storage.interface";

export interface S3Config {
    region: string;
    bucket: string;
    endpoint?: string;
    credentials: {
        accessKeyId: string;
        secretAccessKey: string;
    };
    forcePathStyle?: boolean;
}

export class S3Disk implements StorageDisk {
    private client: any; // S3Client from @aws-sdk/client-s3
    private config: S3Config;

    constructor(config: S3Config) {
        this.config = config;
    }

    private async getClient() {
        if (!this.client) {
            try {
                // @ts-ignore
                const { S3Client } = await import("@aws-sdk/client-s3");
                this.client = new S3Client({
                    region: this.config.region,
                    endpoint: this.config.endpoint,
                    credentials: this.config.credentials,
                    forcePathStyle: this.config.forcePathStyle,
                });
            } catch (error) {
                throw new Error("[nyala/storage] @aws-sdk/client-s3 is required to use S3Disk. Run: npm install @aws-sdk/client-s3");
            }
        }
        return this.client;
    }

    async put(filePath: string, contents: string | Buffer): Promise<void> {
        const client = await this.getClient();
        // @ts-ignore
        const { PutObjectCommand } = await import("@aws-sdk/client-s3");
        
        await client.send(
            new PutObjectCommand({
                Bucket: this.config.bucket,
                Key: filePath,
                Body: contents,
            })
        );
    }

    async get(filePath: string): Promise<Buffer> {
        const stream = await this.stream(filePath);
        const chunks: Buffer[] = [];
        for await (const chunk of stream) {
            chunks.push(chunk as Buffer);
        }
        return Buffer.concat(chunks);
    }

    async putStream(filePath: string, contents: Readable): Promise<void> {
        const client = await this.getClient();

        // PutObjectCommand needs a known Content-Length up front — a raw
        // Readable's length isn't known ahead of time, so sending it
        // through PutObjectCommand directly throws (confirmed against a
        // real S3-compatible backend, not theoretical). @aws-sdk/lib-storage's
        // Upload class is the SDK's own answer to this: it multipart-uploads
        // in bounded-size parts, so the source stream is only ever buffered
        // one part at a time, never fully in memory.
        let Upload: any;
        try {
            // @ts-ignore
            ({ Upload } = await import("@aws-sdk/lib-storage"));
        } catch {
            throw new Error(
                "[nyala/storage] @aws-sdk/lib-storage is required for putStream() (S3 needs it to upload a stream of unknown length). Run: npm install @aws-sdk/lib-storage"
            );
        }

        const upload = new Upload({
            client,
            params: {
                Bucket: this.config.bucket,
                Key: filePath,
                Body: contents,
            },
        });
        await upload.done();
    }

    async stream(filePath: string): Promise<Readable> {
        const client = await this.getClient();
        // @ts-ignore
        const { GetObjectCommand } = await import("@aws-sdk/client-s3");

        const response = await client.send(
            new GetObjectCommand({
                Bucket: this.config.bucket,
                Key: filePath,
            })
        );

        if (!response.Body) {
            throw new Error(`File not found: ${filePath}`);
        }

        // response.Body is a Node Readable when the SDK's default Node HTTP
        // handler is in use (true for @aws-sdk/client-s3 in a Node
        // environment, which is the only environment this package targets).
        return response.Body as Readable;
    }

    async delete(filePath: string): Promise<void> {
        const client = await this.getClient();
        // @ts-ignore
        const { DeleteObjectCommand } = await import("@aws-sdk/client-s3");
        
        await client.send(
            new DeleteObjectCommand({
                Bucket: this.config.bucket,
                Key: filePath,
            })
        );
    }

    async exists(filePath: string): Promise<boolean> {
        const client = await this.getClient();
        // @ts-ignore
        const { HeadObjectCommand } = await import("@aws-sdk/client-s3");
        
        try {
            await client.send(
                new HeadObjectCommand({
                    Bucket: this.config.bucket,
                    Key: filePath,
                })
            );
            return true;
        } catch (error: any) {
            if (error.name === "NotFound") {
                return false;
            }
            throw error;
        }
    }

    async url(filePath: string): Promise<string> {
        // Construct the S3 URL. For presigned URLs, you would use @aws-sdk/s3-request-presigner
        // This is a basic public URL construction.
        if (this.config.endpoint) {
            return `${this.config.endpoint}/${this.config.bucket}/${filePath}`;
        }
        return `https://${this.config.bucket}.s3.${this.config.region}.amazonaws.com/${filePath}`;
    }
}

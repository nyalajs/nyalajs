# @nyalajs/storage

File storage abstraction for Nyala.js — one `put`/`get`/`stream`/`delete`/`exists`/`url` interface across local disk, S3, and Cloudflare R2. Swap disks by changing configuration, not application code.

## Quick start

```ts
import { Injectable } from "@nyalajs/core";
import { StorageService } from "@nyalajs/storage";

@Injectable()
export class AvatarsService {
  constructor(private storage: StorageService) {}

  async save(userId: string, file: Buffer) {
    await this.storage.put(`avatars/${userId}.png`, file);
    return this.storage.url(`avatars/${userId}.png`);
  }
}
```

`StorageService` defaults to a local disk under `storage/app/public` with zero configuration. Register real disks during bootstrap:

```ts
import { LocalDisk } from "@nyalajs/storage";

const storage = app.get(StorageService);
storage.connect({
  default: "local",
  disks: {
    local: new LocalDisk({ root: "./storage/app/public", publicUrl: "/storage" }),
  },
});
```

## Disks

### Local

```ts
new LocalDisk({ root?: string, publicUrl?: string });
```

Sandboxed against directory traversal — a `put()`/`url()` call can't escape the configured `root`.

### S3

```ts
import { S3Disk } from "@nyalajs/storage";

new S3Disk({
  region: string;
  bucket: string;
  endpoint?: string;       // set for S3-compatible services other than AWS
  forcePathStyle?: boolean;
  credentials: { accessKeyId: string; secretAccessKey: string };
});
```

Requires `@aws-sdk/client-s3` (optional peer dependency); `putStream()` additionally needs `@aws-sdk/lib-storage` for its multipart upload path — S3's `PutObject` needs a known Content-Length up front, which a raw stream doesn't have.

```bash
npm install @aws-sdk/client-s3 @aws-sdk/lib-storage
```

### Cloudflare R2

```ts
import { R2Disk } from "@nyalajs/storage";

new R2Disk({
  accountId: string;
  bucket: string;
  credentials: { accessKeyId: string; secretAccessKey: string };
  publicUrl?: string; // needed only if you call url() — see below
});
```

A thin, pre-configured wrapper over `S3Disk` — R2 speaks the same S3 API at `https://<accountId>.r2.cloudflarestorage.com`, with `region: "auto"` and `forcePathStyle: true` set for you automatically. Get `accessKeyId`/`secretAccessKey` from **R2 → Manage R2 API Tokens** in the Cloudflare dashboard (not your global API key).

**R2 has no bucket-derivable public URL** the way S3 does — public access is off by default. Either enable **Public Access** on the bucket to get an assigned `pub-<hash>.r2.dev` hostname, or attach a custom domain, then pass it as `publicUrl`. `url()` throws a clear error if called without one, rather than returning a broken link.

## `StorageDisk` interface

Every disk implements the same shape:

```ts
interface StorageDisk {
  put(path: string, contents: string | Buffer): Promise<void>;
  putStream(path: string, contents: Readable): Promise<void>;

  get(path: string): Promise<Buffer>;
  stream(path: string): Promise<Readable>;

  delete(path: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  url(path: string): Promise<string>;
}
```

`get`/`put` are fully buffered — fine for small files. `stream`/`putStream` never hold the whole file in memory, for anything that might be large:

```ts
// Serve a large file without buffering it
@Get("/videos/:id")
async streamVideo(@Param("id") id: string) {
  return { stream: await this.storage.stream(`videos/${id}.mp4`), contentType: "video/mp4" };
}
```

(Pairs naturally with `@nyalajs/http`'s `StreamableResponse` for serving downloads directly from a controller.)

`StorageService` implements `StorageDisk` too, delegating to the configured default disk (or `storage.disk("name")` for a specific one) — call `storage.put(...)` directly without picking a disk explicitly.

## Documentation

Full docs: [github.com/nyalajs/nyalajs](https://github.com/nyalajs/nyalajs/blob/main/website/docs/features/storage.md).

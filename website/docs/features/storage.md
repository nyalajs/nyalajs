# Storage

`@nyalajs/storage` provides a disk-based file storage abstraction — the same `put`/`get`/`stream`/`delete`/`exists`/`url` interface whether files live on the local filesystem, S3, or Cloudflare R2. Swap disks by changing configuration, not application code.

## Quick Start

```typescript
import { Injectable } from '@nyalajs/core';
import { StorageService } from '@nyalajs/storage';

@Injectable()
export class AvatarsService {
  constructor(private storage: StorageService) {}

  async save(userId: string, file: Buffer) {
    await this.storage.put(`avatars/${userId}.png`, file);
    return this.storage.url(`avatars/${userId}.png`);
  }
}
```

`StorageService` defaults to a local disk under `storage/app/public` with no configuration needed — useful for local development and tests. Call `connect()` during bootstrap to register real disks:

```typescript
// main.ts
import { LocalDisk } from '@nyalajs/storage';

const storage = app.get(StorageService);
storage.connect({
  default: 'local',
  disks: {
    local: new LocalDisk({ root: './storage/app/public', publicUrl: '/storage' }),
  },
});
```

## `StorageDisk` Interface

Every disk — `LocalDisk`, `S3Disk`, `R2Disk` — implements the same interface:

```typescript
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

- **`get`/`put`** — fully buffered. Fine for small files (config, thumbnails, JSON blobs).
- **`stream`/`putStream`** — streamed. Use these for anything that might be large (video, big exports, user uploads) so the file is never fully held in memory at once. See [Streaming](./streaming#file-streaming-in-nyalajs-storage) for details.
- **`url(path)`** — the publicly accessible URL for a file. Behavior differs by disk (see below).

`StorageService` implements the same interface too, delegating to whichever disk is current (`storage.disk('name')`, or the configured default) — so you can call `storage.put(...)` directly without picking a disk explicitly.

## Local Disk

```typescript
import { LocalDisk } from '@nyalajs/storage';

new LocalDisk({
  root?: string;      // defaults to "<cwd>/storage/app/public"
  publicUrl?: string; // defaults to "/storage"
});
```

Paths are sandboxed against directory traversal (`../` segments are stripped) — a `put()`/`url()` call can't write or link outside the configured `root`.

## S3

```typescript
import { S3Disk } from '@nyalajs/storage';

new S3Disk({
  region: string;
  bucket: string;
  endpoint?: string;        // set for S3-compatible services other than AWS
  forcePathStyle?: boolean;
  credentials: {
    accessKeyId: string;
    secretAccessKey: string;
  };
});
```

Requires `@aws-sdk/client-s3` (optional peer dependency — install it yourself; `S3Disk` throws a clear install hint if it's missing rather than a raw module-not-found error). `putStream()` additionally needs `@aws-sdk/lib-storage`.

```bash
npm install @aws-sdk/client-s3 @aws-sdk/lib-storage
```

```typescript
storage.connect({
  default: 's3',
  disks: {
    s3: new S3Disk({
      region: process.env.AWS_REGION!,
      bucket: process.env.AWS_BUCKET!,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      },
    }),
  },
});
```

`url()` constructs a standard `https://<bucket>.s3.<region>.amazonaws.com/<path>` URL, or `<endpoint>/<bucket>/<path>` when a custom `endpoint` is set.

## Cloudflare R2

`R2Disk` is a thin, pre-configured wrapper over `S3Disk` — R2 speaks the same S3 API, just at a different endpoint with a fixed region:

```typescript
import { R2Disk } from '@nyalajs/storage';

new R2Disk({
  accountId: string;
  bucket: string;
  credentials: {
    accessKeyId: string;
    secretAccessKey: string;
  };
  publicUrl?: string;
});
```

```typescript
storage.connect({
  default: 'r2',
  disks: {
    r2: new R2Disk({
      accountId: process.env.R2_ACCOUNT_ID!,
      bucket: 'uploads',
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID!,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
      },
      publicUrl: 'https://pub-1a2b3c4d5e6f.r2.dev', // or your own custom domain
    }),
  },
});
```

`R2Disk` builds the endpoint (`https://<accountId>.r2.cloudflarestorage.com`) and sets `region: "auto"` / `forcePathStyle: true` for you — the values [Cloudflare's own docs](https://developers.cloudflare.com/r2/api/s3/api/) specify for the S3-compatible API. Create the `accessKeyId`/`secretAccessKey` pair under **R2 → Manage R2 API Tokens** in the Cloudflare dashboard — not your global Cloudflare API key, which won't work here.

### Getting a public URL

Unlike S3, **R2 has no account- or bucket-derivable public URL** — a bucket's public access is off by default. To make files publicly readable, either:

1. Enable **Public Access** on the bucket (dashboard → bucket → Settings) to get an assigned `pub-<hash>.r2.dev` hostname, or
2. Attach a custom domain to the bucket (recommended for production — this also puts the bucket behind Cloudflare's cache).

Pass whichever one applies as `publicUrl`. If you never call `url()` — for example, you serve files by proxying `stream()` through your own app instead of linking directly — `publicUrl` can be omitted; `url()` throws a clear error if you call it without one, rather than silently returning a broken link.

Same S3-compatible API underneath means `stream()`/`putStream()` work identically to `S3Disk` — large downloads and uploads never fully buffer in memory, and `putStream()` uses the same `@aws-sdk/lib-storage` multipart upload path.

## Next Steps

- [Streaming](./streaming) - Server-Sent Events and file streaming
- [Configuration](../configuration) - Environment-based config patterns

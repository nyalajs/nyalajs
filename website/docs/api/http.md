# HTTP Utilities

`@nyalajs/http` reference — the real request/response model, parameter decorators, and adapter options. Nyala's HTTP layer is Fastify underneath, not Express — `@Req()`/`@Res()` give you the real Fastify `request`/`reply` objects directly, not a wrapped `Request`/`Response` class.

## Status Codes

There's no `HttpStatus` enum — use the numeric status code directly, either via one of the built-in exception classes (which each carry their own code) or `reply.status(code)`:

```typescript
import { NotFoundException, ConflictException } from '@nyalajs/http';

throw new NotFoundException('User not found');   // 404
throw new ConflictException('Email already in use'); // 409
```

Full list: `BadRequestException` (400), `UnauthorizedException` (401), `ForbiddenException` (403), `NotFoundException` (404), `ConflictException` (409), `UnprocessableEntityException` (422, carries an optional `details` payload), `TooManyRequestsException` (429), `InternalServerErrorException` (500).

## Parameter Decorators

All real, all from `@nyalajs/core` (not `@nyalajs/http`):

```typescript
@Get('/:id')
async show(
  @Param('id') id: string,
  @Query('page') page: number,
  @Headers('authorization') auth: string,
  @Body() dto: CreateUserDto,
  @Req() request: FastifyRequest,
  @Res() reply: FastifyReply,
  @Cookie('session') session: string,
  @Ip() ip: string,
) {}
```

`@Param()`/`@Query()`/`@Headers()`/`@Body()`/`@Cookie()` all accept an optional key (`@Body('email')` extracts just that field) — call them with no argument to get the whole object.

## Response Helpers

There's no `response.json()`/`response.download()` convenience wrapper — a controller method's **return value** is what gets sent:

- Return a plain object/array → JSON-serialized automatically, status 200 (or 204 if the return value is `undefined`/`null`).
- Return something implementing `RenderableResponse` (`{ render(): string | Promise<string>, contentType?, statusCode? }`, e.g. `@nyalajs/react`'s `view()`) → sent as-is with that content type.
- Use `@Res()` to get the real Fastify `reply` object directly for anything else (redirects, custom headers, streaming) — Fastify's own reply API applies: `reply.status(201).send(data)`, `reply.header('X-Custom', 'value')`, `reply.redirect('/new-url')`.

```typescript
@Post('/')
async create(@Body() dto: CreateUserDto) {
  const user = await this.usersService.create(dto);
  return { statusCode: 201, data: user }; // just a returned object — no response.json() call
}

@Get('/redirect')
async redirect(@Res() reply: FastifyReply) {
  return reply.redirect('/new-url');
}
```

## Content Negotiation

Nyala's own `ExceptionHandler` does real `Accept`-header content negotiation for error responses (HTML error page vs. JSON), but there's no `request.accepts()` helper for your own handlers — read `request.headers.accept` directly if you need this in a controller:

```typescript
@Get('/')
async findAll(@Req() request: FastifyRequest, @Res() reply: FastifyReply) {
  const users = await this.usersService.findAll();
  const accept = request.headers.accept ?? '';

  if (accept.includes('application/json')) return users;
  return reply.status(406).send('Not Acceptable');
}
```

## File Upload

Backed by `@fastify/multipart`, not multer — `@UploadedFile()`/`@UploadedFiles()` don't return an `Express.Multer.File`:

```typescript
import { Post, UploadedFile, UploadedFiles } from '@nyalajs/core';

@Post('/upload')
async upload(@UploadedFile('file') file: any) {
  // file.filename, file.mimetype, file.toBuffer() — the @fastify/multipart shape
}

@Post('/uploads')
async uploads(@UploadedFiles('files') files: any[]) {
  return { count: files.length };
}
```

## Streaming

Use the real Fastify reply directly:

```typescript
@Get('/stream')
async stream(@Res() reply: FastifyReply) {
  const stream = fs.createReadStream('/path/to/large-file');
  return reply.send(stream);
}
```

## Cookies

`@Cookie()` reads incoming cookies; setting one is done via the Fastify reply (requires `@fastify/cookie`, registered when `session: true` is passed to `FastifyAdapterOptions`):

```typescript
@Get('/')
async index(@Cookie('token') token: string, @Res() reply: FastifyReply) {
  reply.setCookie('token', 'value', { httpOnly: true, secure: true, maxAge: 3600 });
}
```

## `FastifyAdapterOptions`

Passed to `new FastifyAdapter(container, options)` in `bootstrap/main.ts` — this is where CORS, security headers, CSRF, rate limiting, and sessions are actually configured. There's no separate `app.use(cors(...))`/`app.use(rateLimit(...))` middleware-registration API:

```typescript
export interface FastifyAdapterOptions {
  cors?: boolean;
  corsOrigin?: string | string[] | boolean; // default false — explicit opt-in
  helmet?: boolean;   // default true
  csrf?: boolean;      // default true
  rateLimit?: boolean; // default true — Redis-backed when REDIS_URL/REDIS_HOST is set
  compress?: boolean;  // default true outside test environments
  bodyLimit?: number;
  requestTimeout?: number;
  swagger?: boolean;   // default true — live docs at /docs
  session?: boolean;
  staticDir?: string;
  staticPrefix?: string;
  errorView?: ErrorViewRenderer;
}
```

```typescript
const httpAdapter = new FastifyAdapter(app.getKernel().getContainer(), {
  corsOrigin: ['https://example.com'],
  rateLimit: true,
});
```

See [Security](./security) for the guard/CSRF/rate-limiting picture in full — this option list is the authoritative reference for what `FastifyAdapter` actually accepts.

## Next Steps

- [Middleware](../building-blocks/middleware) - Custom middleware
- [Controllers](../building-blocks/controllers) - HTTP controllers
- [Error Handling](../features/error-handling) - Error responses
- [Security](./security) - Guards and adapter security options

# HTTP Utilities

HTTP-related utilities and helpers.

## Status Codes

```typescript
import { HttpStatus } from '@nyalajs/core';

HttpStatus.OK                    // 200
HttpStatus.CREATED               // 201
HttpStatus.NO_CONTENT            // 204
HttpStatus.BAD_REQUEST           // 400
HttpStatus.UNAUTHORIZED          // 401
HttpStatus.FORBIDDEN             // 403
HttpStatus.NOT_FOUND             // 404
HttpStatus.CONFLICT              // 409
HttpStatus.INTERNAL_SERVER_ERROR // 500
```

## Response Helpers

```typescript
import { Response } from '@nyalajs/core';

// JSON response
response.json({ data: 'value' });

// Status code
response.status(201).json({ created: true });

// Headers
response.header('X-Custom', 'value');

// Redirect
response.redirect('/new-url');

// Download
response.download('/path/to/file');
```

## Request Helpers

```typescript
import { Request } from '@nyalajs/core';

// Query parameters
request.query.page;
request.query.limit;

// Body
request.body;

// Parameters
request.params.id;

// Headers
request.headers['authorization'];
request.get('content-type');

// IP address
request.ip;

// User agent
request.get('user-agent');
```

## Content Negotiation

```typescript
@Get('/')
async findAll(@Req() request: Request, @Res() response: Response) {
  const users = await this.usersService.findAll();

  if (request.accepts('json')) {
    return response.json(users);
  }

  if (request.accepts('xml')) {
    return response.type('xml').send(convertToXml(users));
  }

  return response.status(406).send('Not Acceptable');
}
```

## File Upload

```typescript
import { UploadedFile } from '@nyalajs/core';

@Post('/upload')
async upload(@UploadedFile() file: Express.Multer.File) {
  return {
    filename: file.filename,
    size: file.size,
    mimetype: file.mimetype,
  };
}

// Multiple files
@Post('/uploads')
async uploads(@UploadedFiles() files: Express.Multer.File[]) {
  return {
    count: files.length,
    files: files.map(f => f.filename),
  };
}
```

## Streaming

```typescript
@Get('/stream')
async stream(@Res() response: Response) {
  const stream = fs.createReadStream('/path/to/large-file');
  stream.pipe(response);
}
```

## Cookies

```typescript
// Set cookie
response.cookie('token', 'value', {
  httpOnly: true,
  secure: true,
  maxAge: 3600000,
});

// Get cookie
const token = request.cookies.token;

// Clear cookie
response.clearCookie('token');
```

## CORS

```typescript
import { cors } from '@nyalajs/core';

// Enable CORS
app.use(cors({
  origin: 'https://example.com',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
```

## Rate Limiting

```typescript
import { rateLimit } from '@nyalajs/core';

// Apply rate limiting
app.use(rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per window
  message: 'Too many requests',
}));
```

## Next Steps

- [Middleware](../building-blocks/middleware) - Custom middleware
- [Controllers](../building-blocks/controllers) - HTTP controllers
- [Error Handling](../features/error-handling) - Error responses

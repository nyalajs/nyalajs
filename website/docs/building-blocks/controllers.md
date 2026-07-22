# Controllers

Controllers handle incoming HTTP requests and return responses. They're the entry point for your application's HTTP layer.

## Basic Controller

Create a controller using the `@Controller()` decorator:

```typescript
import { Controller, Get } from '@nyala/core';

@Controller('/users')
export class UsersController {
  @Get('/')
  async index() {
    return { message: 'List all users' };
  }
}
```

## Route Parameters

### Path Parameters

Extract values from the URL path:

```typescript
@Controller('/users')
export class UsersController {
  @Get('/:id')
  async show(@Param('id') id: string) {
    return { id, message: `Get user ${id}` };
  }

  @Get('/:userId/posts/:postId')
  async getPost(
    @Param('userId') userId: string,
    @Param('postId') postId: string
  ) {
    return { userId, postId };
  }
}
```

### Query Parameters

Extract values from query strings:

```typescript
@Controller('/users')
export class UsersController {
  @Get('/')
  async index(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10
  ) {
    return { page, limit };
  }

  // With DTO
  @Get('/')
  async index(@Query() query: PaginationDto) {
    return { page: query.page, limit: query.limit };
  }
}
```

### Request Body

Extract data from request body:

```typescript
@Controller('/users')
export class UsersController {
  @Post('/')
  async store(@Body() dto: CreateUserDto) {
    return { message: 'User created', data: dto };
  }

  @Post('/bulk')
  async bulkCreate(@Body() dtos: CreateUserDto[]) {
    return { message: `${dtos.length} users created` };
  }
}
```

### Headers

Extract values from headers:

```typescript
@Controller('/users')
export class UsersController {
  @Get('/')
  async index(
    @Header('authorization') auth: string,
    @Header('x-api-key') apiKey: string
  ) {
    return { auth, apiKey };
  }
}
```

## HTTP Methods

All standard HTTP methods are supported:

```typescript
@Controller('/users')
export class UsersController {
  @Get('/')
  async index() {
    return 'GET /users';
  }

  @Post('/')
  async store(@Body() dto: CreateUserDto) {
    return 'POST /users';
  }

  @Put('/:id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto
  ) {
    return `PUT /users/${id}`;
  }

  @Patch('/:id')
  async patch(
    @Param('id') id: string,
    @Body() dto: Partial<UpdateUserDto>
  ) {
    return `PATCH /users/${id}`;
  }

  @Delete('/:id')
  async destroy(@Param('id') id: string) {
    return `DELETE /users/${id}`;
  }

  @Options('/')
  async options() {
    return 'OPTIONS /users';
  }

  @Head('/')
  async head() {
    return 'HEAD /users';
  }
}
```

## Dependency Injection

Inject services into controllers:

```typescript
@Controller('/users')
export class UsersController {
  constructor(
    private usersService: UsersService,
    private emailService: EmailService
  ) {}

  @Post('/')
  async store(@Body() dto: CreateUserDto) {
    const user = await this.usersService.create(dto);
    await this.emailService.sendWelcome(user.email);
    return user;
  }
}
```

## Validation

Validate requests with the `@UseValidation()` decorator:

```typescript
import { UseValidation } from '@nyala/validation';
import { CreateUserValidator } from '../validators/users';

@Controller('/users')
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Post('/')
  @UseValidation(CreateUserValidator)
  async store(@Body() dto: CreateUserDto) {
    return this.usersService.create(dto);
  }

  @Put('/:id')
  @UseValidation(UpdateUserValidator)
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto
  ) {
    return this.usersService.update(id, dto);
  }
}
```

## Response Handling

### Return Values

Controllers can return various types:

```typescript
@Controller('/examples')
export class ExamplesController {
  // Object
  @Get('/object')
  async object() {
    return { message: 'Hello' };
  }

  // Array
  @Get('/array')
  async array() {
    return [1, 2, 3];
  }

  // String
  @Get('/string')
  async string() {
    return 'Hello World';
  }

  // Number
  @Get('/number')
  async number() {
    return 42;
  }

  // Promise
  @Get('/promise')
  async promise() {
    return Promise.resolve({ data: 'async data' });
  }
}
```

### Status Codes

Set custom status codes:

```typescript
import { HttpStatus } from '@nyala/core';

@Controller('/users')
export class UsersController {
  @Post('/')
  @HttpCode(HttpStatus.CREATED)
  async store(@Body() dto: CreateUserDto) {
    return this.usersService.create(dto);
  }

  @Delete('/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async destroy(@Param('id') id: string) {
    await this.usersService.delete(id);
  }
}
```

### Custom Headers

Add custom response headers:

```typescript
import { Header } from '@nyala/core';

@Controller('/users')
export class UsersController {
  @Get('/:id')
  @Header('X-Custom-Header', 'custom-value')
  async show(@Param('id') id: string) {
    return this.usersService.findById(id);
  }

  @Get('/')
  @Header('Cache-Control', 'max-age=3600')
  async index() {
    return this.usersService.findAll();
  }
}
```

### Redirect

Redirect to another URL:

```typescript
import { Redirect } from '@nyala/core';

@Controller('/old')
export class RedirectController {
  @Get('/users')
  @Redirect('/api/users', HttpStatus.MOVED_PERMANENTLY)
  oldUsers() {}

  @Get('/dynamic')
  dynamicRedirect(@Query('url') url: string) {
    return { url, statusCode: HttpStatus.FOUND };
  }
}
```

## Error Handling

Throw HTTP exceptions:

```typescript
import {
  NotFoundException,
  BadRequestException,
  UnauthorizedException,
  ForbiddenException,
  ConflictException,
} from '@nyala/core';

@Controller('/users')
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Get('/:id')
  async show(@Param('id') id: string) {
    const user = await this.usersService.findById(id);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  @Post('/')
  async store(@Body() dto: CreateUserDto) {
    const existing = await this.usersService.findByEmail(dto.email);

    if (existing) {
      throw new ConflictException('Email already exists');
    }

    return this.usersService.create(dto);
  }

  @Put('/:id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() currentUser: User
  ) {
    if (currentUser.id !== id) {
      throw new ForbiddenException('Cannot update other users');
    }

    return this.usersService.update(id, dto);
  }
}
```

## Authentication & Authorization

### Require Authentication

```typescript
import { UseGuards } from '@nyala/core';
import { AuthGuard } from '@nyala/auth';

@Controller('/users')
@UseGuards(AuthGuard)  // Protect entire controller
export class UsersController {
  @Get('/profile')
  async profile(@CurrentUser() user: User) {
    return user;
  }

  @Get('/public')
  @Public()  // Allow public access
  async publicRoute() {
    return { message: 'Public data' };
  }
}
```

### Role-Based Access

```typescript
import { Roles } from '@nyala/auth';

@Controller('/admin')
@UseGuards(AuthGuard, RolesGuard)
export class AdminController {
  @Get('/users')
  @Roles('admin')
  async listUsers() {
    return this.usersService.findAll();
  }

  @Delete('/users/:id')
  @Roles('admin', 'moderator')
  async deleteUser(@Param('id') id: string) {
    return this.usersService.delete(id);
  }
}
```

## Request/Response Objects

Access raw request and response:

```typescript
import { Request, Response } from 'express';

@Controller('/files')
export class FilesController {
  @Post('/upload')
  async upload(
    @Req() request: Request,
    @Res() response: Response
  ) {
    // Access request directly
    const files = request.files;

    // Manually send response
    response.status(201).json({
      message: 'File uploaded',
      files,
    });
  }
}
```

:::warning
When using `@Res()`, you must manually send the response. The framework won't handle it automatically.
:::

## Async Operations

All controller methods can be async:

```typescript
@Controller('/users')
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Get('/')
  async index() {
    const users = await this.usersService.findAll();
    return users;
  }

  @Post('/')
  async store(@Body() dto: CreateUserDto) {
    const user = await this.usersService.create(dto);
    return user;
  }
}
```

## Best Practices

### 1. Keep Controllers Thin

Delegate logic to services:

```typescript
// ✅ Good: Thin controller
@Controller('/users')
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Post('/')
  @UseValidation(CreateUserValidator)
  async store(@Body() dto: CreateUserDto) {
    return this.usersService.create(dto);
  }
}

// ❌ Bad: Fat controller
@Controller('/users')
export class UsersController {
  @Post('/')
  async store(@Body() dto: CreateUserDto) {
    // Validation
    if (!dto.email || !dto.password) {
      throw new BadRequestException('Missing fields');
    }

    // Business logic
    const hashedPassword = await bcrypt.hash(dto.password, 10);

    // Database access
    const user = await db.insert(users).values({
      ...dto,
      password: hashedPassword,
    });

    // Email sending
    await sendEmail(user.email, 'Welcome');

    return user;
  }
}
```

### 2. Use DTOs

Type-safe data transfer:

```typescript
// ✅ Good: Type-safe DTO
@Post('/')
async store(@Body() dto: CreateUserDto) {
  return this.usersService.create(dto);
}

// ❌ Bad: Untyped body
@Post('/')
async store(@Body() body: any) {
  return this.usersService.create(body);
}
```

### 3. Handle Errors Properly

```typescript
// ✅ Good: Specific errors
@Get('/:id')
async show(@Param('id') id: string) {
  const user = await this.usersService.findById(id);

  if (!user) {
    throw new NotFoundException('User not found');
  }

  return user;
}

// ❌ Bad: Generic errors
@Get('/:id')
async show(@Param('id') id: string) {
  const user = await this.usersService.findById(id);
  return user || {};  // Silent failure
}
```

### 4. Consistent Naming

```typescript
// RESTful conventions
@Get('/')          // index - list resources
@Get('/:id')       // show - get single resource
@Post('/')         // store - create resource
@Put('/:id')       // update - replace resource
@Patch('/:id')     // patch - partial update
@Delete('/:id')    // destroy - delete resource
```

### 5. Use Validation

Always validate incoming data:

```typescript
// ✅ Good: Validated
@Post('/')
@UseValidation(CreateUserValidator)
async store(@Body() dto: CreateUserDto) {
  return this.usersService.create(dto);
}

// ❌ Bad: No validation
@Post('/')
async store(@Body() dto: any) {
  return this.usersService.create(dto);
}
```

## Next Steps

- [Services](./services) - Business logic layer
- [Validation](../features/validation) - Request validation
- [Authentication](../features/authentication) - Protect routes
- [Error Handling](../features/error-handling) - Error management

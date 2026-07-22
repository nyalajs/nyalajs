# Decorators

Complete reference for all Nyala decorators.

## Class Decorators

### @Controller(path: string)

Marks a class as a controller and defines its base route.

```typescript
@Controller('/api/users')
export class UsersController {
  // Routes will be prefixed with /api/users
}
```

### @Injectable(options?)

Marks a class as injectable for dependency injection.

```typescript
@Injectable()
export class UsersService {
  constructor(private userRepo: UsersRepository) {}
}
```

**Options:**
- `scope?: 'singleton' | 'request' | 'transient'` - Injection scope

### @Module(options)

Defines a module with controllers, providers, imports, and exports.

```typescript
@Module({
  imports: [DatabaseModule],
  controllers: [UsersController],
  providers: [UsersService, UsersRepository],
  exports: [UsersService],
})
export class UsersModule {}
```

## Method Decorators

### HTTP Methods

#### @Get(path?)
Handle GET requests.

```typescript
@Get('/')
async findAll() {}

@Get('/:id')
async findOne(@Param('id') id: string) {}
```

#### @Post(path?)
Handle POST requests.

```typescript
@Post('/')
async create(@Body() dto: CreateDto) {}
```

#### @Put(path?)
Handle PUT requests (full update).

```typescript
@Put('/:id')
async update(@Param('id') id: string, @Body() dto: UpdateDto) {}
```

#### @Patch(path?)
Handle PATCH requests (partial update).

```typescript
@Patch('/:id')
async patch(@Param('id') id: string, @Body() dto: Partial<UpdateDto>) {}
```

#### @Delete(path?)
Handle DELETE requests.

```typescript
@Delete('/:id')
async remove(@Param('id') id: string) {}
```

### Guards and Middleware

#### @UseGuards(...guards)

Apply guards to protect routes.

```typescript
@Get('/profile')
@UseGuards(AuthGuard, RolesGuard)
async getProfile() {}
```

#### @UseValidation(schema, target?)

Apply Zod validation schema.

```typescript
@Post('/')
@UseValidation(CreateUserValidator)
async create(@Body() dto: CreateUserDto) {}
```

### Response Customization

#### @HttpCode(code: number)

Set custom HTTP status code.

```typescript
@Post('/')
@HttpCode(201)
async create() {}
```

#### @Header(name: string, value: string)

Set custom response header.

```typescript
@Get('/')
@Header('Cache-Control', 'max-age=3600')
async findAll() {}
```

#### @Redirect(url: string, statusCode?: number)

Redirect to another URL.

```typescript
@Get('/old-route')
@Redirect('/new-route', 301)
oldRoute() {}
```

## Parameter Decorators

### @Body(key?)

Extract request body.

```typescript
// Entire body
@Post('/')
async create(@Body() dto: CreateDto) {}

// Specific property
@Post('/')
async create(@Body('email') email: string) {}
```

### @Param(key)

Extract URL parameter.

```typescript
@Get('/:id')
async findOne(@Param('id') id: string) {}

@Get('/:userId/posts/:postId')
async getPost(
  @Param('userId') userId: string,
  @Param('postId') postId: string
) {}
```

### @Query(key?)

Extract query parameter.

```typescript
// Entire query object
@Get('/')
async findAll(@Query() query: QueryDto) {}

// Specific parameter
@Get('/')
async findAll(@Query('page') page: number) {}
```

### @Headers(key?)

Extract request headers.

```typescript
// All headers
@Get('/')
async findAll(@Headers() headers: any) {}

// Specific header
@Get('/')
async findAll(@Headers('authorization') auth: string) {}
```

### @Req()

Get full request object.

```typescript
@Get('/')
async findAll(@Req() request: Request) {}
```

### @Res()

Get full response object.

```typescript
@Get('/download')
async download(@Res() response: Response) {
  response.download('/path/to/file');
}
```

:::warning
When using `@Res()`, you must manually send the response.
:::

### @CurrentUser()

Get authenticated user (requires AuthGuard).

```typescript
@Get('/profile')
@UseGuards(AuthGuard)
async getProfile(@CurrentUser() user: User) {}
```

## Property Decorators

### @Inject(token)

Inject custom provider by token.

```typescript
@Injectable()
export class UsersService {
  constructor(
    @Inject('CONFIG') private config: AppConfig
  ) {}
}
```

## Custom Decorators

Create custom parameter decorators:

```typescript
import { createParamDecorator, ExecutionContext } from '@nyala/core';

export const GetUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  }
);

// Usage
@Get('/profile')
async getProfile(@GetUser() user: User) {}
```

Create custom method decorators:

```typescript
import { SetMetadata } from '@nyala/core';

export const Roles = (...roles: string[]) => SetMetadata('roles', roles);

// Usage
@Get('/admin')
@Roles('admin', 'moderator')
async adminRoute() {}
```

## Next Steps

- [Core Services](./core-services) - Built-in services
- [Controllers](../building-blocks/controllers) - Controller guide
- [Guards](../features/authorization) - Authorization

# API Reference

Complete API reference for the Nyala Framework.

## Core Modules

- [@nyalajs/core](#nyalajs-core) - DI, decorators, kernel
- [@nyalajs/http](./http) - Fastify adapter, request/response
- [@nyalajs/security](./security) - Auth, guards, hashing
- [@nyalajs/tenancy](./tenancy) - Multi-tenancy support
- [@nyalajs/validation](#nyalajs-validation) - Zod-based validation
- [@nyalajs/cli](../cli/overview) - Command-line interface

## @nyalajs/core

### Decorators

#### @Controller(path)
Defines a controller class.

```typescript
@Controller('/users')
export class UsersController {}
```

#### @Injectable()
Marks a class as injectable.

```typescript
@Injectable()
export class UsersService {}
```

#### HTTP Method Decorators
- `@Get(path?)` - GET requests
- `@Post(path?)` - POST requests
- `@Put(path?)` - PUT requests
- `@Patch(path?)` - PATCH requests
- `@Delete(path?)` - DELETE requests

```typescript
@Get('/:id')
async show(@Param('id') id: string) {}
```

#### Parameter Decorators
- `@Body()` - Request body
- `@Param(key)` - URL parameter
- `@Query(key)` - Query parameter
- `@Headers(key)` - Request header
- `@Req()` - Full request object
- `@Res()` - Full response object

### Exceptions

- `BadRequestException` - 400
- `UnauthorizedException` - 401
- `ForbiddenException` - 403
- `NotFoundException` - 404
- `ConflictException` - 409
- `UnprocessableEntityException` - 422
- `TooManyRequestsException` - 429
- `InternalServerErrorException` - 500

## @nyalajs/validation

### UseValidation(schema, target?)

Apply Zod schema validation.

```typescript
@Post('/')
@UseValidation(CreateUserValidator)
async create(@Body() dto: CreateUserDto) {}
```

## Next Steps

- [Decorators](./decorators) - Detailed decorator reference
- [Core Services](./core-services) - Built-in services
- [HTTP](./http) - HTTP utilities

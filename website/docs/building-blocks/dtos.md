# DTOs (Data Transfer Objects)

DTOs define the structure of data transferred between layers. They provide type safety and clear contracts for API communication.

## Basic DTO

Define a simple DTO interface:

```typescript
export interface CreateUserDto {
  email: string;
  password: string;
  name: string;
}

export interface UpdateUserDto {
  name?: string;
  bio?: string;
  avatar?: string;
}

export interface UserResponseDto {
  id: string;
  email: string;
  name: string;
  createdAt: Date;
}
```

## Request DTOs

### Create DTO

```typescript
// dto/users/create-user.dto.ts
export interface CreateUserDto {
  email: string;
  password: string;
  name: string;
  role?: 'user' | 'admin';
}
```

### Update DTO

```typescript
// dto/users/update-user.dto.ts
export interface UpdateUserDto {
  name?: string;
  email?: string;
  bio?: string;
  avatar?: string;
}
```

### Query DTO

```typescript
// dto/common/pagination.dto.ts
export interface PaginationDto {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

// dto/users/user-query.dto.ts
export interface UserQueryDto extends PaginationDto {
  role?: string;
  active?: boolean;
  search?: string;
}
```

## Response DTOs

Transform database entities for responses:

```typescript
// dto/users/user-response.dto.ts
export interface UserResponseDto {
  id: string;
  email: string;
  name: string;
  bio: string | null;
  avatar: string | null;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// Exclude sensitive fields
export function toUserResponse(user: User): UserResponseDto {
  const { password, deletedAt, ...response } = user;
  return response;
}
```

## Nested DTOs

Handle complex data structures:

```typescript
// dto/orders/create-order.dto.ts
export interface CreateOrderItemDto {
  productId: string;
  quantity: number;
  price: number;
}

export interface CreateOrderDto {
  userId: string;
  items: CreateOrderItemDto[];
  shippingAddress: {
    street: string;
    city: string;
    state: string;
    zip: string;
    country: string;
  };
  paymentMethod: 'credit_card' | 'paypal' | 'bank_transfer';
}
```

## Response DTOs with Relations

```typescript
// dto/posts/post-response.dto.ts
export interface AuthorDto {
  id: string;
  name: string;
  avatar: string | null;
}

export interface CommentDto {
  id: string;
  content: string;
  author: AuthorDto;
  createdAt: Date;
}

export interface PostResponseDto {
  id: string;
  title: string;
  content: string;
  slug: string;
  author: AuthorDto;
  comments: CommentDto[];
  tags: string[];
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
```

## Partial DTOs

Use TypeScript utility types:

```typescript
import { Partial, Pick, Omit } from 'typescript';

// Make all fields optional
export type UpdateUserDto = Partial<CreateUserDto>;

// Pick specific fields
export type UserPreviewDto = Pick<User, 'id' | 'name' | 'avatar'>;

// Omit specific fields
export type SafeUserDto = Omit<User, 'password' | 'deletedAt'>;
```

## DTO Classes

Use classes for DTOs with methods:

```typescript
// dto/users/create-user.dto.ts
export class CreateUserDto {
  email: string;
  password: string;
  name: string;
  role?: string;

  constructor(data: Partial<CreateUserDto>) {
    Object.assign(this, data);
  }

  // Add helper methods
  normalize(): CreateUserDto {
    return {
      ...this,
      email: this.email.toLowerCase().trim(),
      name: this.name.trim(),
    };
  }

  isAdmin(): boolean {
    return this.role === 'admin';
  }
}
```

## DTO Transformation

Transform between DTOs and entities:

```typescript
// dto/users/user.mapper.ts
export class UserMapper {
  static toResponse(user: User): UserResponseDto {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      bio: user.bio,
      avatar: user.avatar,
      active: user.active,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  static toResponseList(users: User[]): UserResponseDto[] {
    return users.map(user => this.toResponse(user));
  }

  static fromCreateDto(dto: CreateUserDto): Partial<User> {
    return {
      email: dto.email.toLowerCase(),
      password: dto.password,  // Should be hashed in service
      name: dto.name,
      role: dto.role || 'user',
    };
  }

  static fromUpdateDto(dto: UpdateUserDto): Partial<User> {
    const update: Partial<User> = {};

    if (dto.name) update.name = dto.name;
    if (dto.email) update.email = dto.email.toLowerCase();
    if (dto.bio !== undefined) update.bio = dto.bio;
    if (dto.avatar !== undefined) update.avatar = dto.avatar;

    return update;
  }
}

// Usage in service
@Injectable()
export class UsersService {
  async create(dto: CreateUserDto): Promise<UserResponseDto> {
    const userData = UserMapper.fromCreateDto(dto);
    const user = await this.userRepo.create(userData);
    return UserMapper.toResponse(user);
  }
}
```

## Paginated Response DTO

```typescript
// dto/common/paginated-response.dto.ts
export interface PaginationMetaDto {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrevious: boolean;
}

export interface PaginatedResponseDto<T> {
  data: T[];
  pagination: PaginationMetaDto;
}

// Usage
export function createPaginatedResponse<T>(
  data: T[],
  total: number,
  page: number,
  limit: number
): PaginatedResponseDto<T> {
  const totalPages = Math.ceil(total / limit);

  return {
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNext: page < totalPages,
      hasPrevious: page > 1,
    },
  };
}
```

## Error Response DTO

```typescript
// dto/common/error-response.dto.ts
export interface ErrorResponseDto {
  statusCode: number;
  message: string;
  error?: string;
  errors?: ValidationErrorDto[];
  timestamp: string;
  path: string;
}

export interface ValidationErrorDto {
  field: string;
  message: string;
  value?: any;
}
```

## DTO with Validation Metadata

```typescript
// dto/users/create-user.dto.ts
export interface CreateUserDto {
  /** User's email address - must be unique */
  email: string;

  /** Password - minimum 8 characters */
  password: string;

  /** User's full name - 2-100 characters */
  name: string;

  /** Optional user role */
  role?: 'user' | 'admin' | 'moderator';
}

// With JSDoc for better IDE support
/**
 * Data transfer object for creating a new user
 * @example
 * {
 *   email: "user@example.com",
 *   password: "SecurePass123!",
 *   name: "John Doe"
 * }
 */
export interface CreateUserDto {
  email: string;
  password: string;
  name: string;
}
```

## Generic DTOs

Create reusable generic DTOs:

```typescript
// dto/common/api-response.dto.ts
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
  errors?: string[];
  timestamp: string;
}

export interface ListResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

// Usage
const userResponse: ApiResponse<UserResponseDto> = {
  success: true,
  data: user,
  timestamp: new Date().toISOString(),
};

const usersList: ListResponse<UserResponseDto> = {
  items: users,
  total: 100,
  page: 1,
  pageSize: 10,
};
```

## DTO Organization

Structure your DTOs logically:

```
app/dto/
├── common/
│   ├── pagination.dto.ts
│   ├── api-response.dto.ts
│   └── error-response.dto.ts
├── users/
│   ├── create-user.dto.ts
│   ├── update-user.dto.ts
│   ├── user-response.dto.ts
│   ├── user-query.dto.ts
│   └── index.ts  // Barrel export
├── posts/
│   ├── create-post.dto.ts
│   ├── update-post.dto.ts
│   ├── post-response.dto.ts
│   └── index.ts
└── orders/
    ├── create-order.dto.ts
    ├── order-response.dto.ts
    └── index.ts
```

## Barrel Exports

Use barrel exports for clean imports:

```typescript
// dto/users/index.ts
export * from './create-user.dto';
export * from './update-user.dto';
export * from './user-response.dto';
export * from './user-query.dto';

// Usage elsewhere
import { CreateUserDto, UpdateUserDto, UserResponseDto } from '@/dto/users';
```

## Best Practices

### 1. Separate Request and Response DTOs

```typescript
// ✅ Good: Separate DTOs
export interface CreateUserDto {
  email: string;
  password: string;
  name: string;
}

export interface UserResponseDto {
  id: string;
  email: string;
  name: string;
  createdAt: Date;
}

// ❌ Bad: Single DTO for everything
export interface UserDto {
  id?: string;
  email: string;
  password?: string;
  name: string;
  createdAt?: Date;
}
```

### 2. Exclude Sensitive Data

```typescript
// ✅ Good: Remove sensitive fields
export function toUserResponse(user: User): UserResponseDto {
  const { password, deletedAt, resetToken, ...safe } = user;
  return safe;
}

// ❌ Bad: Return everything
export function toUserResponse(user: User): User {
  return user;  // Includes password!
}
```

### 3. Use TypeScript Types

```typescript
// ✅ Good: Type-safe
export interface CreatePostDto {
  title: string;
  content: string;
  status: 'draft' | 'published';
  tags: string[];
}

// ❌ Bad: Untyped
export interface CreatePostDto {
  title: any;
  content: any;
  status: string;
  tags: any;
}
```

### 4. Document DTOs

```typescript
// ✅ Good: Well documented
/**
 * DTO for creating a new order
 * @property userId - ID of the user placing the order
 * @property items - Array of items to order
 * @property total - Total order amount in cents
 */
export interface CreateOrderDto {
  userId: string;
  items: OrderItemDto[];
  total: number;
}

// ❌ Bad: No documentation
export interface CreateOrderDto {
  userId: string;
  items: OrderItemDto[];
  total: number;
}
```

### 5. Use Validation

DTOs work great with validators:

```typescript
// DTO definition
export interface CreateUserDto {
  email: string;
  password: string;
  name: string;
}

// Matching validator
export const CreateUserValidator = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(2).max(100),
});

// Controller usage
@Post('/')
@UseValidation(CreateUserValidator)
async create(@Body() dto: CreateUserDto) {
  return this.usersService.create(dto);
}
```

## Next Steps

- [Validators](./validators) - Validation schemas
- [Controllers](./controllers) - Using DTOs in controllers
- [Services](./services) - DTO transformation in services

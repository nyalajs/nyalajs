# Validation

Automatic request validation using Zod schemas ensures data integrity before it reaches your business logic.

## Quick Start

Apply validation with the `@UseValidation()` decorator:

```typescript
import { Controller, Post, Body } from '@nyala/core';
import { UseValidation } from '@nyala/validation';
import { CreateUserValidator } from '../validators/users';

@Controller('/users')
export class UsersController {
  @Post('/')
  @UseValidation(CreateUserValidator)
  async create(@Body() dto: CreateUserDto) {
    // dto is guaranteed to be valid here
    return this.usersService.create(dto);
  }
}
```

## Validation Flow

```
Request → Validator → Valid? → Controller
                         ↓
                       Invalid
                         ↓
                    400 Bad Request
                    (with error details)
```

## Creating Validators

Define validation schemas with Zod:

```typescript
// validators/users/create-user.validator.ts
import { z } from 'zod';

export const CreateUserValidator = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain an uppercase letter')
    .regex(/[a-z]/, 'Password must contain a lowercase letter')
    .regex(/[0-9]/, 'Password must contain a number'),
  name: z.string()
    .min(2, 'Name must be at least 2 characters')
    .max(100, 'Name must not exceed 100 characters'),
  age: z.number()
    .int('Age must be an integer')
    .min(18, 'Must be at least 18 years old')
    .optional(),
});
```

## Validation Targets

### Body Validation

Validate request body:

```typescript
@Post('/')
@UseValidation(CreateUserValidator)
async create(@Body() dto: CreateUserDto) {
  return this.usersService.create(dto);
}
```

### Query Validation

Validate query parameters:

```typescript
@Get('/')
@UseValidation(UserQueryValidator, 'query')
async index(@Query() query: UserQueryDto) {
  return this.usersService.findAll(query);
}
```

### Params Validation

Validate URL parameters:

```typescript
@Get('/:id')
@UseValidation(IdParamValidator, 'params')
async show(@Param('id') id: string) {
  return this.usersService.findById(id);
}
```

## Error Responses

Validation failures return detailed errors:

```json
{
  "statusCode": 400,
  "message": "Validation failed",
  "errors": [
    {
      "field": "email",
      "message": "Invalid email address",
      "value": "invalid-email"
    },
    {
      "field": "password",
      "message": "Password must be at least 8 characters",
      "value": "short"
    }
  ],
  "timestamp": "2024-01-15T10:30:00.000Z",
  "path": "/users"
}
```

## Common Validators

### Pagination

```typescript
// validators/common/pagination.validator.ts
export const PaginationValidator = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});
```

### Search

```typescript
export const SearchValidator = z.object({
  q: z.string().min(1, 'Search query required'),
  filters: z.record(z.string()).optional(),
  page: z.coerce.number().default(1),
  limit: z.coerce.number().default(10),
});
```

### ID Parameter

```typescript
export const IdParamValidator = z.object({
  id: z.string().uuid('Invalid ID format'),
});
```

## Nested Validation

Validate complex nested structures:

```typescript
export const CreateOrderValidator = z.object({
  userId: z.string().uuid(),
  items: z.array(
    z.object({
      productId: z.string().uuid(),
      quantity: z.number().int().positive(),
      price: z.number().positive(),
    })
  ).min(1, 'At least one item required'),
  shippingAddress: z.object({
    street: z.string().min(1),
    city: z.string().min(1),
    state: z.string().length(2),
    zip: z.string().regex(/^\d{5}$/),
  }),
  notes: z.string().max(500).optional(),
});
```

## Conditional Validation

Validate based on other fields:

```typescript
export const CreateAccountValidator = z.object({
  type: z.enum(['individual', 'business']),
  name: z.string(),
  email: z.string().email(),
  companyName: z.string().optional(),
  taxId: z.string().optional(),
}).refine(
  (data) => {
    if (data.type === 'business') {
      return !!data.companyName && !!data.taxId;
    }
    return true;
  },
  {
    message: 'Company name and tax ID required for business accounts',
    path: ['companyName'],
  }
);
```

## Custom Validation

Add custom validation logic:

```typescript
export const PasswordChangeValidator = z.object({
  currentPassword: z.string(),
  newPassword: z.string().min(8),
  confirmPassword: z.string(),
}).refine(
  (data) => data.newPassword === data.confirmPassword,
  {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  }
).refine(
  (data) => data.currentPassword !== data.newPassword,
  {
    message: 'New password must be different',
    path: ['newPassword'],
  }
);
```

## Async Validation

Validate against database:

```typescript
export const CreateUserValidator = z.object({
  email: z.string().email(),
  username: z.string().min(3),
}).refine(
  async (data) => {
    const exists = await usersRepo.findByEmail(data.email);
    return !exists;
  },
  {
    message: 'Email already registered',
    path: ['email'],
  }
);
```

## Transform Data

Transform input during validation:

```typescript
export const CreatePostValidator = z.object({
  title: z.string()
    .trim()
    .transform((val) => val.toLowerCase()),

  tags: z.string()
    .transform((str) => str.split(',').map(t => t.trim()))
    .pipe(z.array(z.string()).min(1)),

  publishDate: z.string()
    .datetime()
    .transform((str) => new Date(str)),
});
```

## Partial Validation

Validate partial updates:

```typescript
// Full validation for create
export const CreateU', 'image/png', 'image/gif']),
    size: z.number().max(5 * 1024 * 1024, 'File must be less than 5MB'),
  }),
  title: z.string().optional(),
  description: z.string().max(500).optional(),
});
```

## Array Validation

Validate arrays with constraints:

```typescript
export const BulkCreateValidator = z.object({
  users: z.array(
    z.object({
      email: z.string().email(),
      name: z.string(),
    })
  ).min(1).max(100, 'Maximum 100 users per batch'),
});
```

## Enum Validation

Validate against enums:

```typescript
export const UpdateStatusValidator = z.object({
  status: z.enum([
    'pending',
    'processing',
    'completed',
    'cancelled'
  ], {
    errorMap: () => ({ message: 'Invalid status' }),
  }),
});
```

## Union Validation

Validate multiple types:

```typescript
export const PaymentValidator = z.object({
  method: z.enum(['credit_card', 'paypal']),
  details: z.union([
    // Credit card
    z.object({
      cardNumber: z.string().length(16),
      cvv: z.string().length(3),
      expiryDate: z.string().regex(/^\d{2}\/\d{2}$/),
    }),
    // PayPal
    z.object({
      email: z.string().email(),
    }),
  ]),
});
```

## Global Validation Pipe

Apply validation globally:

```typescript
// main.ts
import { ValidationPipe } from '@nyala/validation';

async function bootstrap() {
  const app = await NyalaFactory.create(AppModule);

  // Apply validation pipe globally
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,  // Remove unknown properties
    forbidNonWhitelisted: true,  // Throw on unknown properties
    transform: true,  // Transform to DTO types
  }));

  await app.listen(3000);
}
```

## Custom Error Messages

Provide helpful error messages:

```typescript
export const CreateUserValidator = z.object({
  email: z.string({
    required_error: 'Email is required',
    invalid_type_error: 'Email must be a string',
  }).email('Please provide a valid email address'),

  password: z.string({
    required_error: 'Password is required',
  }).min(8, 'Password must be at least 8 characters long')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),

  age: z.number({
    required_error: 'Age is required',
    invalid_type_error: 'Age must be a number',
  }).min(18, 'You must be at least 18 years old'),
});
```

## Best Practices

### 1. Match DTOs

```typescript
// ✅ Good: Validator matches DTO
export interface CreateUserDto {
  email: string;
  password: string;
  name: string;
}

export const CreateUserValidator = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(2),
});

// Type check: ensure they match
type ValidatedType = z.infer<typeof CreateUserValidator>;
const test: ValidatedType = {} as CreateUserDto; // Should not error
```

### 2. Clear Error Messages

```typescript
// ✅ Good: Specific, actionable
password: z.string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[A-Z]/, 'Include at least one uppercase letter')

// ❌ Bad: Generic, unhelpful
password: z.string().min(8, 'Invalid').regex(/[A-Z]/, 'Bad format')
```

### 3. Validate Early

```typescript
// ✅ Good: Validate at controller
@Post('/')
@UseValidation(CreateUserValidator)
async create(@Body() dto: CreateUserDto) {
  return this.service.create(dto);
}

// ❌ Bad: Validate in service
async create(dto: any) {
  // dto might be invalid here
  const validated = CreateUserValidator.parse(dto);
}
```

### 4. Reuse Schemas

```typescript
// ✅ Good: Reusable schemas
const emailSchema = z.string().email();
const passwordSchema = z.string().min(8);

export const LoginValidator = z.object({
  email: emailSchema,
  password: passwordSchema,
});

export const RegisterValidator = z.object({
  email: emailSchema,
  password: passwordSchema,
  name: z.string().min(2),
});
```

### 5. Document Validators

```typescript
/**
 * Validates user registration data
 * - Email must be valid and unique
 * - Password minimum 8 characters with uppercase and number
 * - Name between 2-100 characters
 */
export const CreateUserValidator = z.object({
  email: z.string().email(),
  password: z.string().min(8).regex(/[A-Z]/).regex(/[0-9]/),
  name: z.string().min(2).max(100),
});
```

## Next Steps

- [Validators](../building-blocks/validators) - Validator reference
- [DTOs](../building-blocks/dtos) - Data transfer objects
- [Error Handling](./error-handling) - Error responses

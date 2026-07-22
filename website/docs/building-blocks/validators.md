# Validators

Validators ensure incoming data meets your requirements using Zod schemas. They provide type-safe validation with detailed error messages.

## Basic Validator

Create a Zod schema:

```typescript
import { z } from 'zod';

export const CreateUserValidator = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  name: z.string().min(2, 'Name must be at least 2 characters'),
});
```

## Using Validators

Apply validation to controller endpoints:

```typescript
import { UseValidation } from '@nyala/validation';
import { CreateUserValidator } from '../validators/users';

@Controller('/users')
export class UsersController {
  @Post('/')
  @UseValidation(CreateUserValidator)
  async create(@Body() dto: CreateUserDto) {
    return this.usersService.create(dto);
  }
}
```

## String Validation

```typescript
export const StringValidator = z.object({
  // Basic string
  name: z.string(),

  // Min/max length
  username: z.string().min(3).max(20),

  // Email
  email: z.string().email(),

  // URL
  website: z.string().url(),

  // UUID
  id: z.string().uuid(),

  // Regex
  phone: z.string().regex(/^\+?[1-9]\d{1,14}$/),

  // Enum
  role: z.enum(['user', 'admin', 'moderator']),

  // Lowercase/uppercase
  slug: z.string().toLowerCase(),
  code: z.string().toUpperCase(),

  // Trim
  bio: z.string().trim(),

  // Custom validation
  password: z.string().refine(
    (val) => /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(val),
    'Password must contain uppercase, lowercase, and number'
  ),
});
```

## Number Validation

```typescript
export const NumberValidator = z.object({
  // Basic number
  age: z.number(),

  // Min/max
  rating: z.number().min(1).max(5),

  // Integer
  quantity: z.number().int(),

  // Positive/negative
  price: z.number().positive(),
  debt: z.number().negative(),

  // Non-negative/non-positive
  count: z.number().nonnegative(),

  // Finite
  value: z.number().finite(),

  // Multiple of
  percentage: z.number().multipleOf(5),

  // Transform string to number
  port: z.string().transform(Number),
  // or
  port: z.coerce.number(),
});
```

## Boolean Validation

```typescript
export const BooleanValidator = z.object({
  // Basic boolean
  active: z.boolean(),

  // With default
  emailNotifications: z.boolean().default(true),

  // Transform from string
  agree: z.string().transform((val) => val === 'true'),
  // or
  agree: z.coerce.boolean(),
});
```

## Date Validation

```typescript
export const DateValidator = z.object({
  // Basic date
  createdAt: z.date(),

  // ISO string to date
  eventDate: z.string().datetime().transform((str) => new Date(str)),
  // or
  eventDate: z.coerce.date(),

  // Min/max date
  birthDate: z.date()
    .min(new Date('1900-01-01'))
    .max(new Date()),

  // Future date
  appointmentDate: z.date().refine(
    (date) => date > new Date(),
    'Date must be in the future'
  ),
});
```

## Array Validation

```typescript
export const ArrayValidator = z.object({
  // Basic array
  tags: z.array(z.string()),

  // Min/max length
  items: z.array(z.string()).min(1).max(10),

  // Non-empty
  categories: z.array(z.string()).nonempty(),

  // Array of objects
  users: z.array(z.object({
    id: z.string(),
    name: z.string(),
  })),

  // Unique array
  uniqueTags: z.array(z.string()).refine(
    (arr) => new Set(arr).size === arr.length,
    'Tags must be unique'
  ),
});
```

## Object Validation

```typescript
export const ObjectValidator = z.object({
  // Nested object
  address: z.object({
    street: z.string(),
    city: z.string(),
    state: z.string(),
    zip: z.string(),
  }),

  // Partial object (all fields optional)
  settings: z.object({
    theme: z.string(),
    language: z.string(),
  }).partial(),

  // Pick specific fields
  user: z.object({
    id: z.string(),
    email: z.string(),
    name: z.string(),
  }).pick({ id: true, name: true }),

  // Omit fields
  userData: z.object({
    id: z.string(),
    password: z.string(),
    email: z.string(),
  }).omit({ password: true }),
});
```

## Optional and Nullable

```typescript
export const OptionalValidator = z.object({
  // Optional (field can be undefined)
  bio: z.string().optional(),

  // Nullable (field can be null)
  deletedAt: z.date().nullable(),

  // Both optional and nullable
  middleName: z.string().optional().nullable(),

  // With default value
  role: z.string().default('user'),

  // Optional with default
  active: z.boolean().optional().default(true),
});
```

## Union Types

```typescript
export const UnionValidator = z.object({
  // String or number
  identifier: z.union([z.string(), z.number()]),

  // Multiple types
  value: z.union([
    z.string(),
    z.number(),
    z.boolean(),
  ]),

  // Discriminated union
  notification: z.discriminatedUnion('type', [
    z.object({
      type: z.literal('email'),
      address: z.string().email(),
    }),
    z.object({
      type: z.literal('sms'),
      phone: z.string(),
    }),
  ]),
});
```

## Complex Validators

### Nested Validation

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
    country: z.string().length(2),
  }),
  paymentMethod: z.enum(['credit_card', 'paypal', 'bank_transfer']),
  notes: z.string().max(500).optional(),
});
```

### Cross-Field Validation

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
    message: 'New password must be different from current password',
    path: ['newPassword'],
  }
);
```

### Conditional Validation

```typescript
export const UserValidator = z.object({
  type: z.enum(['individual', 'business']),
  name: z.string(),
  email: z.string().email(),

  // Required only for business
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

## Custom Validators

### Custom Validation Logic

```typescript
export const CreateProductValidator = z.object({
  name: z.string(),
  price: z.number().positive(),
  discount: z.number().min(0).max(100),
}).refine(
  (data) => {
    const finalPrice = data.price * (1 - data.discount / 100);
    return finalPrice > 0;
  },
  'Final price must be greater than 0'
);
```

### Async Validation

```typescript
export const CreateUserValidator = z.object({
  email: z.string().email(),
  username: z.string().min(3),
}).refine(
  async (data) => {
    const exists = await checkEmailExists(data.email);
    return !exists;
  },
  {
    message: 'Email already exists',
    path: ['email'],
  }
);
```

## Transform Data

```typescript
export const CreatePostValidator = z.object({
  title: z.string().trim().transform((val) => val.toLowerCase()),

  content: z.string(),

  tags: z.string()
    .transform((str) => str.split(','))
    .pipe(z.array(z.string()).min(1)),

  publishDate: z.string()
    .transform((str) => new Date(str)),

  metadata: z.string()
    .transform((str) => JSON.parse(str))
    .pipe(z.object({
      author: z.string(),
      category: z.string(),
    })),
});
```

## Error Handling

### Custom Error Messages

```typescript
export const CreateUserValidator = z.object({
  email: z.string({
    required_error: 'Email is required',
    invalid_type_error: 'Email must be a string',
  }).email('Please provide a valid email address'),

  password: z.string({
    required_error: 'Password is required',
  }).min(8, 'Password must be at least 8 characters long'),

  age: z.number({
    required_error: 'Age is required',
    invalid_type_error: 'Age must be a number',
  }).min(18, 'You must be at least 18 years old'),
});
```

### Error Formatting

```typescript
import { ZodError } from 'zod';

function formatZodError(error: ZodError) {
  return error.errors.map((err) => ({
    field: err.path.join('.'),
    message: err.message,
    code: err.code,
  }));
}

// Usage
try {
  CreateUserValidator.parse(data);
} catch (error) {
  if (error instanceof ZodError) {
    const formatted = formatZodError(error);
    throw new BadRequestException({
      message: 'Validation failed',
      errors: formatted,
    });
  }
}
```

## Validation Organization

Structure validators logically:

```
app/validators/
├── common/
│   ├── pagination.validator.ts
│   └── query.validator.ts
├── users/
│   ├── create-user.validator.ts
│   ├── update-user.validator.ts
│   ├── change-password.validator.ts
│   └── index.ts
├── posts/
│   ├── create-post.validator.ts
│   ├── update-post.validator.ts
│   └── index.ts
└── orders/
    ├── create-order.validator.ts
    └── index.ts
```

## Reusable Schemas

Create reusable schema components:

```typescript
// validators/common/schemas.ts
export const emailSchema = z.string().email().toLowerCase();
export const passwordSchema = z.string().min(8).max(100);
export const uuidSchema = z.string().uuid();
export const phoneSchema = z.string().regex(/^\+?[1-9]\d{1,14}$/);

// validators/users/create-user.validator.ts
import { emailSchema, passwordSchema } from '../common/schemas';

export const CreateUserValidator = z.object({
  email: emailSchema,
  password: passwordSchema,
  name: z.string().min(2).max(100),
});
```

## Best Practices

### 1. Match DTOs

Validators should match DTO structure:

```typescript
// DTO
export interface CreateUserDto {
  email: string;
  password: string;
  name: string;
}

// Matching validator
export const CreateUserValidator = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(2),
});
```

### 2. Provide Clear Messages

```typescript
// ✅ Good: Clear, actionable messages
export const CreateUserValidator = z.object({
  email: z.string().email('Please provide a valid email address'),
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain an uppercase letter')
    .regex(/[0-9]/, 'Password must contain a number'),
});

// ❌ Bad: Generic messages
export const CreateUserValidator = z.object({
  email: z.string().email('Invalid'),
  password: z.string().min(8, 'Too short'),
});
```

### 3. Validate Early

```typescript
// ✅ Good: Validate at controller
@Post('/')
@UseValidation(CreateUserValidator)
async create(@Body() dto: CreateUserDto) {
  return this.usersService.create(dto);
}

// ❌ Bad: Validate in service
async create(dto: any) {
  // Data might be invalid here
  const validated = CreateUserValidator.parse(dto);
  // ...
}
```

### 4. Use Transform Wisely

```typescript
// ✅ Good: Simple transforms
email: z.string().email().toLowerCase().trim()

// ❌ Bad: Complex logic in transforms
email: z.string().transform(async (val) => {
  const exists = await checkDatabase(val);
  return exists ? null : val;
})
```

### 5. Document Validators

```typescript
/**
 * Validator for creating a new user account
 *
 * @property email - Valid email address (lowercase)
 * @property password - Minimum 8 characters with uppercase and number
 * @property name - User's full name (2-100 characters)
 */
export const CreateUserValidator = z.object({
  email: z.string().email().toLowerCase(),
  password: z.string()
    .min(8)
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/),
  name: z.string().min(2).max(100),
});
```

## Next Steps

- [DTOs](./dtos) - Data transfer objects
- [Controllers](./controllers) - Using validators
- [Error Handling](../features/error-handling) - Validation errors

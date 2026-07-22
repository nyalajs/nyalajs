# Error Handling

Nyala provides structured error handling with HTTP exceptions, global error filters, and detailed error responses.

## HTTP Exceptions

Throw HTTP exceptions in your code:

```typescript
import {
  BadRequestException,
  UnauthorizedException,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  InternalServerErrorException,
} from '@nyala/core';

@Injectable()
export class UsersService {
  async findById(id: string) {
    const user = await this.userRepo.findById(id);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  async create(dto: CreateUserDto) {
    const existing = await this.userRepo.findByEmail(dto.email);

    if (existing) {
      throw new ConflictException('Email already exists');
    }

    return this.userRepo.create(dto);
  }
}
```

## Available Exceptions

| Exception | Status Code | Use Case |
|-----------|-------------|------ilable |

## Custom Exceptions

Create custom exceptions:

```typescript
export class InvalidTokenException extends UnauthorizedException {
  constructor() {
    super('Invalid or expired token');
  }
}

export class EmailNotVerifiedException extends ForbiddenException {
  constructor() {
    super('Please verify your email address');
  }
}

export class InsufficientFundsException extends BadRequestException {
  constructor(balance: number, required: number) {
    super(`Insufficient funds. Balance: ${balance}, Required: ${required}`);
  }
}

// Usage
throw new InvalidTokenException();
throw new EmailNotVerifiedException();
throw new InsufficientFundsException(100, 150);
```

## Error Response Format

Standard error response:

```json
{
  "statusCode": 404,
  "message": "User not found",
  "error": "Not Found",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "path": "/users/invalid-id"
}
```

Validation error response:

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
      "message": "Password must be at least 8 characters"
    }
  ],
  "timestamp": "2024-01-15T10:30:00.000Z",
  "path": "/users"
}
```

## Global Error Filter

Create a global error handler:

```typescript
import { ExceptionFilter, Catch, ArgumentsHost, HttpException } from '@nyala/core';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const request = ctx.getRequest();

    const status = exception instanceof HttpException
      ? exception.getStatus()
      : 500;

    const message = exception instanceof HttpException
      ? exception.message
      : 'Internal server error';

    // Log error
    console.error('Error:', {
      statusCode: status,
      message,
      path: request.url,
      method: request.method,
      timestamp: new Date().toISOString(),
      stack: exception instanceof Error ? exception.stack : undefined,
    });

    // Send response
    response.status(status).json({
      statusCode: status,
      message,
      error: exception instanceof HttpException
        ? exception.constructor.name.replace('Exception', '')
        : 'Internal Server Error',
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }
}

// Register globally in main.ts
import { GlobalExceptionFilter } from './filters/global-exception.filter';

async function bootstrap() {
  const app = await NyalaFactory.create(AppModule);
  app.useGlobalFilters(new GlobalExceptionFilter());
  await app.listen(3000);
}
```

## Try-Catch in Controllers

Handle errors in controllers:

```typescript
@Controller('/users')
export class UsersController {
  @Get('/:id')
  async show(@Param('id') id: string) {
    try {
      const user = await this.usersService.findById(id);
      return user;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error; // Re-throw HTTP exceptions
      }

      // Log unexpected errors
      console.error('Unexpected error:', error);
      throw new InternalServerErrorException('Failed to fetch user');
    }
  }
}
```

## Service Layer Errors

Throw appropriate errors in services:

```typescript
@Injectable()
export class OrdersService {
  async create(dto: CreateOrderDto) {
    // Validate product existence
    const product = await this.productsService.findById(dto.productId);
    if (!product) {
      throw new NotFoundException('Product not found');
    }

    // Validate stock
    if (product.stock < dto.quantity) {
      throw new BadRequestException('Insufficient stock');
    }

    // Check user permissions
    if (!this.canCreateOrder(dto.userId)) {
      throw new ForbiddenException('Cannot create order');
    }

    try {
      return await this.orderRepo.create(dto);
    } catch (error) {
      console.error('Database error:', error);
      throw new InternalServerErrorException('Failed to create order');
    }
  }
}
```

## Validation Errors

Validation automatically throws formatted errors:

```typescript
@Post('/')
@UseValidation(CreateUserValidator)
async create(@Body() dto: CreateUserDto) {
  // If validation fails, throws 400 with detailed errors
  return this.usersService.create(dto);
}

// Response on validation failure:
// {
//   "statusCode": 400,
//   "message": "Validation failed",
//   "errors": [...]
// }
```

## Database Errors

Transform database errors:

```typescript
@Injectable()
export class UsersService {
  async create(dto: CreateUserDto) {
    try {
      return await this.userRepo.create(dto);
    } catch (error) {
      // Unique constraint violation
      if (error.code === '23505') {
        throw new ConflictException('Email already exists');
      }

      // Foreign key violation
      if (error.code === '23503') {
        throw new BadRequestException('Invalid reference');
      }

      // Re-throw other errors
      throw new InternalServerErrorException('Database error');
    }
  }
}
```

## External API Errors

Handle external API errors:

```typescript
@Injectable()
export class PaymentService {
  async charge(amount: number) {
    try {
      const result = await this.stripeClient.charges.create({
        amount,
        currency: 'usd',
      });
      return result;
    } catch (error) {
      // Transform Stripe errors
      if (error.type === 'StripeCardError') {
        throw new BadRequestException(error.message);
      }

      if (error.type === 'StripeRateLimitError') {
        throw new TooManyRequestsException('Please try again later');
      }

      if (error.type === 'StripeAPIError') {
        throw new ServiceUnavailableException('Payment service unavailable');
      }

      throw new InternalServerErrorException('Payment failed');
    }
  }
}
```

## Async Error Handling

Handle async errors properly:

```typescript
@Injectable()
export class ReportService {
  async generateReport(userId: string) {
    try {
      const data = await this.fetchData(userId);
      const report = await this.processData(data);
      await this.saveReport(report);
      return report;
    } catch (error) {
      console.error('Report generation failed:', error);
      throw new InternalServerErrorException('Failed to generate report');
    }
  }

  private async fetchData(userId: string) {
    const data = await this.dataRepo.findByUser(userId);
    if (!data) {
      throw new NotFoundException('No data found for user');
    }
    return data;
  }
}
```

## Error Logging

Log errors with context:

```typescript
@Injectable()
export class ErrorLoggerService {
  log(error: Error, context?: any) {
    const errorLog = {
      message: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString(),
      context,
    };

    if (process.env.NODE_ENV === 'production') {
      // Send to error tracking service
      this.sendToErrorTracker(errorLog);
    } else {
      // Log to console in development
      console.error('Error:', errorLog);
    }
  }

  private sendToErrorTracker(error: any) {
    // Send to Sentry, Rollbar, etc.
  }
}

// Usage in service
@Injectable()
export class UsersService {
  constructor(
    private userRepo: UsersRepository,
    private errorLogger: ErrorLoggerService
  ) {}

  async findById(id: string) {
    try {
      return await this.userRepo.findById(id);
    } catch (error) {
      this.errorLogger.log(error, { userId: id, operation: 'findById' });
      throw new InternalServerErrorException('Failed to fetch user');
    }
  }
}
```

## Error Context

Add context to errors:

```typescript
export class AppException extends HttpException {
  constructor(
    message: string,
    status: number,
    public context?: Record<string, any>
  ) {
    super(message, status);
  }
}

// Usage
throw new AppException(
  'Payment failed',
  402,
  {
    orderId: '123',
    amount: 100,
    reason: 'insufficient_funds',
  }
);
```

## Best Practices

### 1. Use Specific Exceptions

```typescript
// ✅ Good: Specific exception
if (!user) {
  throw new NotFoundException('User not found');
}

// ❌ Bad: Generic exception
if (!user) {
  throw new Error('Not found');
}
```

### 2. Provide Helpful Messages

```typescript
// ✅ Good: Descriptive message
throw new BadRequestException(
  'Password must contain at least one uppercase letter, one lowercase letter, and one number'
);

// ❌ Bad: Vague message
throw new BadRequestException('Invalid input');
```

### 3. Don't Expose Internal Details

```typescript
// ✅ Good: Safe message
catch (error) {
  console.error('Database error:', error);
  throw new InternalServerErrorException('Failed to create user');
}

// ❌ Bad: Exposes internals
catch (error) {
  throw new InternalServerErrorException(error.message);
  // Might expose database schema or sensitive info
}
```

### 4. Log Before Throwing

```typescript
// ✅ Good: Log then throw
catch (error) {
  console.error('Payment processing failed:', error);
  throw new BadRequestException('Payment failed');
}

// ❌ Bad: Silent failure
catch (error) {
  throw new BadRequestException('Payment failed');
  // Error details lost
}
```

### 5. Use Error Codes

```typescript
export class AppError extends HttpException {
  constructor(
    message: string,
    status: number,
    public code: string
  ) {
    super({ message, code }, status);
  }
}

throw new AppError('Email already exists', 409, 'EMAIL_EXISTS');

// Response:
// {
//   "statusCode": 409,
//   "message": "Email already exists",
//   "code": "EMAIL_EXISTS"
// }
```

## Next Steps

- [Logging](./logging) - Application logging
- [Validation](./validation) - Input validation
- [Testing](../testing/unit) - Error testing

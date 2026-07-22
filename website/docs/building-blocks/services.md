# Services

Services contain your application's business logic. They orchestrate between controllers and repositories, implementing the core functionality of your application.

## Basic Service

Create a service with the `@Injectable()` decorator:

```typescript
import { Injectable } from '@nyalajs/core';
import { UsersRepository } from '../repositories/users.repository';

@Injectable()
export class UsersService {
  constructor(private usersRepo: UsersRepository) {}

  async findAll() {
    return this.usersRepo.findAll();
  }

  async findById(id: string) {
    const user = await this.usersRepo.findById(id);
    if (!user) {
      throw new Error('User not found');
    }
    return user;
  }
}
```

## Dependency Injection

Services can inject other services and repositories:

```typescript
@Injectable()
export class OrdersService {
  constructor(
    private ordersRepo: OrdersRepository,
    private productsService: ProductsService,
    private emailService: EmailService,
    private paymentService: PaymentService
  ) {}

  async create(dto: CreateOrderDto) {
    // Use injected services
    const product = await this.productsService.findById(dto.productId);
    const order = await this.ordersRepo.create(dto);
    await this.paymentService.charge(order.total);
    await this.emailService.sendReceipt(order);
    return order;
  }
}
```

## CRUD Operations

Implement standard CRUD operations:

```typescript
@Injectable()
export class ProductsService {
  constructor(private productsRepo: ProductsRepository) {}

  async findAll(query?: PaginationDto) {
    return this.productsRepo.findAll({
      limit: query?.limit || 10,
      offset: query?.offset || 0,
    });
  }

  async findById(id: string) {
    const product = await this.productsRepo.findById(id);
    if (!product) {
      throw new NotFoundException('Product not found');
    }
    return product;
  }

  async create(dto: CreateProductDto) {
    return this.productsRepo.create(dto);
  }

  async update(id: string, dto: UpdateProductDto) {
    const product = await this.productsRepo.update(id, dto);
    if (!product) {
      throw new NotFoundException('Product not found');
    }
    return product;
  }

  async delete(id: string) {
    const deleted = await this.productsRepo.delete(id);
    if (!deleted) {
      throw new NotFoundException('Product not found');
    }
    return { message: 'Product deleted successfully' };
  }
}
```

## Business Logic

Services contain business rules and validation:

```typescript
@Injectable()
export class UsersService {
  constructor(
    private usersRepo: UsersRepository,
    private emailService: EmailService,
    private hashService: HashService
  ) {}

  async create(dto: CreateUserDto) {
    // Business rule: Check if email exists
    const existing = await this.usersRepo.findByEmail(dto.email);
    if (existing) {
      throw new ConflictException('Email already exists');
    }

    // Business rule: Hash password
    const hashedPassword = await this.hashService.hash(dto.password);

    // Create user
    const user = await this.usersRepo.create({
      ...dto,
      password: hashedPassword,
    });

    // Business rule: Send welcome email
    await this.emailService.sendWelcome(user.email);

    // Don't return password
    const { password, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  async updatePassword(userId: string, oldPassword: string, newPassword: string) {
    // Business rule: Verify old password
    const user = await this.usersRepo.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const isValid = await this.hashService.compare(oldPassword, user.password);
    if (!isValid) {
      throw new UnauthorizedException('Invalid password');
    }

    // Business rule: New password must be different
    if (oldPassword === newPassword) {
      throw new BadRequestException('New password must be different');
    }

    // Update password
    const hashedPassword = await this.hashService.hash(newPassword);
    await this.usersRepo.update(userId, { password: hashedPassword });

    // Business rule: Notify user
    await this.emailService.sendPasswordChanged(user.email);

    return { message: 'Password updated successfully' };
  }
}
```

## Service Composition

Services can compose other services:

```typescript
@Injectable()
export class CheckoutService {
  constructor(
    private cartService: CartService,
    private inventoryService: InventoryService,
    private paymentService: PaymentService,
    private orderService: OrderService,
    private emailService: EmailService
  ) {}

  async process(userId: string, paymentMethod: string) {
    // Get cart
    const cart = await this.cartService.getCart(userId);
    if (!cart.items.length) {
      throw new BadRequestException('Cart is empty');
    }

    // Check inventory
    for (const item of cart.items) {
      const available = await this.inventoryService.check(
        item.productId,
        item.quantity
      );
      if (!available) {
        throw new BadRequestException(`${item.product.name} is out of stock`);
      }
    }

    // Process payment
    const payment = await this.paymentService.charge({
      amount: cart.total,
      method: paymentMethod,
      userId,
    });

    // Reserve inventory
    await this.inventoryService.reserve(cart.items);

    // Create order
    const order = await this.orderService.create({
      userId,
      items: cart.items,
      total: cart.total,
      paymentId: payment.id,
    });

    // Clear cart
    await this.cartService.clear(userId);

    // Send confirmation
    await this.emailService.sendOrderConfirmation(order);

    return order;
  }
}
```

## Transaction Management

Handle database transactions:

```typescript
@Injectable()
export class TransferService {
  constructor(
    private accountsRepo: AccountsRepository,
    private transactionsRepo: TransactionsRepository
  ) {}

  async transfer(fromId: string, toId: string, amount: number) {
    // Start transaction
    return await this.accountsRepo.transaction(async (trx) => {
      // Deduct from sender
      const sender = await this.accountsRepo.findById(fromId, trx);
      if (sender.balance < amount) {
        throw new BadRequestException('Insufficient funds');
      }
      await this.accountsRepo.update(
        fromId,
        { balance: sender.balance - amount },
        trx
      );

      // Add to receiver
      const receiver = await this.accountsRepo.findById(toId, trx);
      await this.accountsRepo.update(
        toId,
        { balance: receiver.balance + amount },
        trx
      );

      // Record transaction
      const transaction = await this.transactionsRepo.create(
        {
          fromId,
          toId,
          amount,
          status: 'completed',
        },
        trx
      );

      return transaction;
    });
  }
}
```

## Error Handling

Handle and transform errors appropriately:

```typescript
@Injectable()
export class PaymentService {
  constructor(
    private paymentGateway: PaymentGateway,
    private ordersRepo: OrdersRepository
  ) {}

  async processPayment(orderId: string) {
    try {
      const order = await this.ordersRepo.findById(orderId);
      if (!order) {
        throw new NotFoundException('Order not found');
      }

      const result = await this.paymentGateway.charge({
        amount: order.total,
        currency: 'USD',
      });

      await this.ordersRepo.update(orderId, {
        status: 'paid',
        paymentId: result.id,
      });

      return result;
    } catch (error) {
      // Transform external errors
      if (error.code === 'insufficient_funds') {
        throw new BadRequestException('Payment failed: Insufficient funds');
      }

      if (error.code === 'card_declined') {
        throw new BadRequestException('Payment failed: Card declined');
      }

      // Log unexpected errors
      console.error('Payment processing error:', error);
      throw new InternalServerErrorException('Payment processing failed');
    }
  }
}
```

## Caching

Implement caching in services:

```typescript
@Injectable()
export class ProductsService {
  constructor(
    private productsRepo: ProductsRepository,
    private cacheService: CacheService
  ) {}

  async findById(id: string) {
    const cacheKey = `product:${id}`;

    // Check cache
    const cached = await this.cacheService.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    // Fetch from database
    const product = await this.productsRepo.findById(id);
    if (!product) {
      throw new NotFoundException('Product not found');
    }

    // Cache result
    await this.cacheService.set(
      cacheKey,
      JSON.stringify(product),
      3600 // 1 hour
    );

    return product;
  }

  async update(id: string, dto: UpdateProductDto) {
    const product = await this.productsRepo.update(id, dto);

    // Invalidate cache
    await this.cacheService.delete(`product:${id}`);

    return product;
  }
}
```

## Async Operations

Handle async operations properly:

```typescript
@Injectable()
export class ReportService {
  constructor(
    private ordersRepo: OrdersRepository,
    private emailService: EmailService
  ) {}

  async generateMonthlyReport(userId: string) {
    // Start async operation
    const reportId = generateId();

    // Process in background (don't await)
    this.processReport(reportId, userId).catch(error => {
      console.error('Report generation failed:', error);
    });

    return {
      reportId,
      status: 'processing',
      message: 'Report generation started',
    };
  }

  private async processReport(reportId: string, userId: string) {
    try {
      // Heavy operation
      const orders = await this.ordersRepo.findByUser(userId);
      const report = this.calculateStats(orders);

      // Save report
      await this.saveReport(reportId, report);

      // Notify user
      await this.emailService.sendReportReady(userId, reportId);
    } catch (error) {
      await this.markReportFailed(reportId, error);
      throw error;
    }
  }
}
```

## Event Emission

Emit events for loosely coupled architecture:

```typescript
@Injectable()
export class OrdersService {
  constructor(
    private ordersRepo: OrdersRepository,
    private eventEmitter: EventEmitter
  ) {}

  async create(dto: CreateOrderDto) {
    const order = await this.ordersRepo.create(dto);

    // Emit event instead of direct coupling
    this.eventEmitter.emit('order.created', {
      orderId: order.id,
      userId: order.userId,
      total: order.total,
    });

    return order;
  }

  async cancel(id: string) {
    const order = await this.ordersRepo.findById(id);
    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (order.status === 'shipped') {
      throw new BadRequestException('Cannot cancel shipped order');
    }

    await this.ordersRepo.update(id, { status: 'cancelled' });

    this.eventEmitter.emit('order.cancelled', {
      orderId: id,
      userId: order.userId,
    });

    return { message: 'Order cancelled successfully' };
  }
}

// Event listener in another service
@Injectable()
export class EmailListener {
  constructor(private emailService: EmailService) {}

  @On('order.created')
  async handleOrderCreated(data: any) {
    await this.emailService.sendOrderConfirmation(data);
  }

  @On('order.cancelled')
  async handleOrderCancelled(data: any) {
    await this.emailService.sendCancellationNotice(data);
  }
}
```

## Best Practices

### 1. Single Responsibility

Each service should have one clear purpose:

```typescript
// ✅ Good: Focused services
@Injectable()
export class UsersService {
  // User management only
}

@Injectable()
export class EmailService {
  // Email sending only
}

@Injectable()
export class AuthService {
  // Authentication only
}

// ❌ Bad: Mixed responsibilities
@Injectable()
export class UsersService {
  async create(dto) { /* ... */ }
  async sendEmail() { /* ... */ }
  async authenticate() { /* ... */ }
}
```

### 2. Dependency Injection

Use constructor injection:

```typescript
// ✅ Good
@Injectable()
export class OrdersService {
  constructor(
    private ordersRepo: OrdersRepository,
    private emailService: EmailService
  ) {}
}

// ❌ Bad
@Injectable()
export class OrdersService {
  async create(dto) {
    const emailService = new EmailService();  // Don't do this
  }
}
```

### 3. Error Handling

Use appropriate HTTP exceptions:

```typescript
// ✅ Good
async findById(id: string) {
  const user = await this.usersRepo.findById(id);
  if (!user) {
    throw new NotFoundException('User not found');
  }
  return user;
}

// ❌ Bad
async findById(id: string) {
  const user = await this.usersRepo.findById(id);
  return user || null;  // Silent failure
}
```

### 4. Data Transformation

Transform data in services, not controllers:

```typescript
// ✅ Good
@Injectable()
export class UsersService {
  async create(dto: CreateUserDto) {
    const hashedPassword = await hash(dto.password);
    const user = await this.usersRepo.create({
      ...dto,
      password: hashedPassword,
    });
    const { password, ...result } = user;
    return result;
  }
}

// ❌ Bad
@Controller('/users')
export class UsersController {
  @Post('/')
  async store(@Body() dto: CreateUserDto) {
    const hashedPassword = await hash(dto.password);  // Don't do in controller
    return this.usersService.create({ ...dto, password: hashedPassword });
  }
}
```

### 5. Testing

Design services to be easily testable:

```typescript
@Injectable()
export class OrdersService {
  constructor(
    private ordersRepo: OrdersRepository,
    private emailService: EmailService
  ) {}

  async create(dto: CreateOrderDto) {
    const order = await this.ordersRepo.create(dto);
    await this.emailService.sendConfirmation(order);
    return order;
  }
}

// Easy to test with mocks
describe('OrdersService', () => {
  it('should create order and send email', async () => {
    const mockRepo = { create: jest.fn().mockResolvedValue(order) };
    const mockEmail = { sendConfirmation: jest.fn() };
    const service = new OrdersService(mockRepo, mockEmail);

    await service.create(dto);

    expect(mockRepo.create).toHaveBeenCalledWith(dto);
    expect(mockEmail.sendConfirmation).toHaveBeenCalledWith(order);
  });
});
```

## Next Steps

- [Repositories](./repositories) - Data access layer
- [DTOs](./dtos) - Data transfer objects
- [Validation](../features/validation) - Input validation
- [Error Handling](../features/error-handling) - Error management

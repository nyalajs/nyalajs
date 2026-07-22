# E-commerce Example

Complete e-commerce platform with Nyala.

## Features

- Product catalog with categories
- Shopping cart
- Order management
- Payment processing (Stripe)
- Inventory management
- User reviews and ratings
- Admin dashboard

## Architecture

```
ecommerce/
├── app/
│   ├── modules/
│   │   ├── products/
│   │   ├── orders/
│   │   ├── cart/
│   │   ├── payments/
│   │   └── admin/
│   └── shared/
└── database/
```

## Product Management

```typescript
@Controller('/products')
export class ProductsController {
  @Get('/')
  async index(@Query() query: ProductQueryDto) {
    return this.productsService.findAll(query);
  }

  @Get('/:id')
  async show(@Param('id') id: string) {
    return this.productsService.findById(id);
  }

  @Post('/')
  @UseGuards(AuthGuard, AdminGuard)
  async create(@Body() dto: CreateProductDto) {
    return this.productsService.create(dto);
  }
}
```

## Shopping Cart

```typescript
@Controller('/cart')
@UseGuards(AuthGuard)
export class CartController {
  @Get('/')
  async getCart(@CurrentUser() user: User) {
    return this.cartService.getCart(user.id);
  }

  @Post('/items')
  async addItem(
    @CurrentUser() user: User,
    @Body() dto: AddToCartDto
  ) {
    return this.cartService.addItem(user.id, dto);
  }

  @Delete('/items/:id')
  async removeItem(
    @CurrentUser() user: User,
    @Param('id') itemId: string
  ) {
    return this.cartService.removeItem(user.id, itemId);
  }
}
```

## Order Processing

```typescript
@Injectable()
export class OrdersService {
  async create(userId: string, dto: CreateOrderDto) {
    // Validate cart
    const cart = await this.cartService.getCart(userId);
    if (!cart.items.length) {
      throw new BadRequestException('Cart is empty');
    }

    // Check inventory
    await this.inventoryService.validateAvailability(cart.items);

    // Process payment
    const payment = await this.paymentService.charge({
      amount: cart.total,
      userId,
      method: dto.paymentMethod,
    });

    // Create order
    const order = await this.ordersRepo.create({
      userId,
      items: cart.items,
      total: cart.total,
      paymentId: payment.id,
      status: 'pending',
    });

    // Reserve inventory
    await this.inventoryService.reserve(order.items);

    // Clear cart
    await this.cartService.clear(userId);

    // Send confirmation
    await this.emailService.sendOrderConfirmation(order);

    return order;
  }
}
```

## Payment Integration

```typescript
@Injectable()
export class StripePaymentService {
  constructor(private stripe: StripeClient) {}

  async charge(dto: ChargeDto) {
    try {
      const charge = await this.stripe.charges.create({
        amount: dto.amount * 100, // Convert to cents
        currency: 'usd',
        source: dto.token,
        description: `Order payment for user ${dto.userId}`,
      });

      return {
        id: charge.id,
        status: charge.status,
        amount: charge.amount / 100,
      };
    } catch (error) {
      throw new BadRequestException('Payment failed');
    }
  }
}
```

## Source Code

Full source: [github.com/nyalajs/examples/ecommerce](https://github.com/nyalajs/examples/tree/main/ecommerce)

# Microservices Example

Building microservices architecture with Nyala.

## Architecture

```
                  ┌─────────────┐
                  │   Gateway   │
                  └──────┬──────┘
                         │
         ┌───────────────┼───────────────┐
         │               │               │
    ┌────▼────┐    ┌────▼────┐    ┌────▼────┐
    │  Users  │    │ Orders  │    │Products │
    │ Service │    │ Service │    │ Service │
    └─────────┘    └─────────┘    └─────────┘
```

## Services

### 1. API Gateway

```typescript
// gateway/main.ts
import { NyalaFactory } from '@nyala/core';
import { GatewayModule } from './gateway.module';

async function bootstrap() {
  const app = await NyalaFactory.create(GatewayModule);
  await app.listen(3000);
}

bootstrap();
```

```typescript
// gateway/gateway.controller.ts
@Controller('/api')
export class GatewayController {
  constructor(
    private usersClient: UsersClient,
    private ordersClient: OrdersClient
  ) {}

  @Get('/users/:id')
  async getUser(@Param('id') id: string) {
    return this.usersClient.findById(id);
  }

  @Get('/orders')
  async getOrders(@Query() query: any) {
    return this.ordersClient.findAll(query);
  }
}
```

### 2. Users Service

```typescript
// users-service/main.ts
async function bootstrap() {
  const app = await NyalaFactory.createMicroservice(UsersModule, {
    transport: Transport.TCP,
    options: {
      host: 'localhost',
      port: 3001,
    },
  });

  await app.listen();
}
```

```typescript
// users-service/users.controller.ts
@Controller()
export class UsersController {
  constructor(private usersService: UsersService) {}

  @MessagePattern({ cmd: 'find_user' })
  async findUser(@Payload() id: string) {
    return this.usersService.findById(id);
  }

  @MessagePattern({ cmd: 'create_user' })
  async createUser(@Payload() dto: CreateUserDto) {
    return this.usersService.create(dto);
  }
}
```

### 3. Orders Service

```typescript
// orders-service/main.ts
async function bootstrap() {
  const app = await NyalaFactory.createMicroservice(OrdersModule, {
    transport: Transport.REDIS,
    options: {
      host: 'localhost',
      port: 6379,
    },
  });

  await app.listen();
}
```

```typescript
// orders-service/orders.controller.ts
@Controller()
export class OrdersController {
  constructor(
    private ordersService: OrdersService,
    private usersClient: ClientProxy
  ) {}

  @MessagePattern({ cmd: 'create_order' })
  async createOrder(@Payload() dto: CreateOrderDto) {
    // Call users service
    const user = await firstValueFrom(
      this.usersClient.send({ cmd: 'find_user' }, dto.userId)
    );

    return this.ordersService.create(dto, user);
  }
}
```

## Communication

### Request-Response

```typescript
// Send request and wait for response
const user = await firstValueFrom(
  this.usersClient.send({ cmd: 'find_user' }, userId)
);
```

### Event-Based

```typescript
// Emit event (fire and forget)
this.ordersClient.emit('order_created', order);

// Listen to event
@EventPattern('order_created')
async handleOrderCreated(@Payload() order: Order) {
  await this.emailService.sendConfirmation(order);
}
```

## Service Discovery

```typescript
// consul/eureka integration
@Injectable()
export class ServiceDiscovery {
  private services = new Map<string, string>();

  async register(serviceName: string, address: string) {
    this.services.set(serviceName, address);
  }

  async discover(serviceName: string): Promise<string> {
    return this.services.get(serviceName);
  }
}
```

## Load Balancing

```typescript
@Injectable()
export class LoadBalancer {
  private currentIndex = 0;

  getNextServer(servers: string[]): string {
    const server = servers[this.currentIndex];
    this.currentIndex = (this.currentIndex + 1) % servers.length;
    return server;
  }
}
```

## Circuit Breaker

```typescript
@Injectable()
export class CircuitBreaker {
  private failures = 0;
  private state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      throw new Error('Circuit breaker is OPEN');
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess() {
    this.failures = 0;
    this.state = 'CLOSED';
  }

  private onFailure() {
    this.failures++;
    if (this.failures >= 5) {
      this.state = 'OPEN';
      setTimeout(() => {
        this.state = 'HALF_OPEN';
      }, 60000); // Try again after 1 minute
    }
  }
}
```

## Running Services

```bash
# Terminal 1 - Users Service
cd users-service
npm run dev

# Terminal 2 - Orders Service
cd orders-service
npm run dev

# Terminal 3 - Products Service
cd products-service
npm run dev

# Terminal 4 - API Gateway
cd gateway
npm run dev
```

## Docker Compose

```yaml
version: '3.8'

services:
  gateway:
    build: ./gateway
    ports:
      - "3000:3000"
    depends_on:
      - users-service
      - orders-service

  users-service:
    build: ./users-service
    ports:
      - "3001:3001"
    environment:
      - DB_HOST=postgres
      - DB_PORT=5432

  orders-service:
    build: ./orders-service
    ports:
      - "3002:3002"
    environment:
      - DB_HOST=postgres
      - REDIS_HOST=redis

  postgres:
    image: postgres:14
    environment:
      POSTGRES_PASSWORD: postgres

  redis:
    image: redis:7
```

## Source Code

Full source: [github.com/nyalajs/examples/microservices](https://github.com/nyalajs/examples/tree/main/microservices)

# Core Services

Built-in services provided by Nyala framework.

## Configuration Service

Access application configuration.

```typescript
@Injectable()
export class ConfigService {
  get<T>(key: string, defaultValue?: T): T;
  getNumber(key: string, defaultValue?: number): number;
  getBoolean(key: string, defaultValue?: boolean): boolean;
}

// Usage
@Injectable()
export class AppService {
  constructor(private config: ConfigService) {}

  getPort() {
    return this.config.getNumber('PORT', 3000);
  }
}
```

## Logger Service

Application logging.

```typescript
@Injectable()
export class LoggerService {
  log(message: string, context?: string): void;
  error(message: string, trace?: string, context?: string): void;
  warn(message: string, context?: string): void;
  debug(message: string, context?: string): void;
  verbose(message: string, context?: string): void;
}

// Usage
@Injectable()
export class UsersService {
  constructor(private logger: LoggerService) {}

  async create(dto: CreateUserDto) {
    this.logger.log('Creating user', 'UsersService');
    // ...
  }
}
```

## Event Emitter

Emit and listen to application events.

```typescript
@Injectable()
export class EventEmitter {
  emit(event: string, data: any): void;
  on(event: string, handler: Function): void;
  once(event: string, handler: Function): void;
  off(event: string, handler: Function): void;
}

// Emit events
@Injectable()
export class OrdersService {
  constructor(private events: EventEmitter) {}

  async create(dto: CreateOrderDto) {
    const order = await this.repo.create(dto);
    this.events.emit('order.created', order);
    return order;
  }
}

// Listen to events
@Injectable()
export class EmailService {
  constructor(private events: EventEmitter) {
    this.events.on('order.created', this.sendOrderEmail.bind(this));
  }

  private async sendOrderEmail(order: Order) {
    // Send email
  }
}
```

## Cache Service

Application caching.

```typescript
@Injectable()
export class CacheService {
  async get<T>(key: string): Promise<T | null>;
  async set(key: string, value: any, ttl?: number): Promise<void>;
  async delete(key: string): Promise<void>;
  async clear(): Promise<void>;
  async has(key: string): Promise<boolean>;
}

// Usage
@Injectable()
export class ProductsService {
  constructor(private cache: CacheService) {}

  async findById(id: string) {
    const cached = await this.cache.get<Product>(`product:${id}`);
    if (cached) return cached;

    const product = await this.repo.findById(id);
    await this.cache.set(`product:${id}`, product, 3600);
    return product;
  }
}
```

## HTTP Service

Make HTTP requests.

```typescript
@Injectable()
export class HttpService {
  get<T>(url: string, config?: RequestConfig): Promise<T>;
  post<T>(url: string, data?: any, config?: RequestConfig): Promise<T>;
  put<T>(url: string, data?: any, config?: RequestConfig): Promise<T>;
  delete<T>(url: string, config?: RequestConfig): Promise<T>;
}

// Usage
@Injectable()
export class PaymentService {
  constructor(private http: HttpService) {}

  async charge(amount: number) {
    return this.http.post('https://api.stripe.com/charges', {
      amount,
      currency: 'usd',
    });
  }
}
```

## Scheduler Service

Schedule tasks and cron jobs.

```typescript
@Injectable()
export class SchedulerService {
  schedule(name: string, cron: string, callback: Function): void;
  interval(name: string, milliseconds: number, callback: Function): void;
  timeout(name: string, milliseconds: number, callback: Function): void;
  cancel(name: string): void;
}

// Usage
@Injectable()
export class TasksService implements OnModuleInit {
  constructor(private scheduler: SchedulerService) {}

  onModuleInit() {
    // Run every day at midnight
    this.scheduler.schedule('cleanup', '0 0 * * *', () => {
      this.cleanup();
    });

    // Run every hour
    this.scheduler.interval('health-check', 3600000, () => {
      this.checkHealth();
    });
  }

  private async cleanup() {
    // Cleanup logic
  }

  private async checkHealth() {
    // Health check logic
  }
}
```

## Queue Service

Background job processing.

```typescript
@Injectable()
export class QueueService {
  add(queue: string, job: string, data: any, options?: JobOptions): Promise<void>;
  process(queue: string, handler: Function): void;
}

// Usage
@Injectable()
export class EmailService {
  constructor(private queue: QueueService) {}

  async sendWelcomeEmail(email: string) {
    await this.queue.add('emails', 'welcome', { email });
  }

  onModuleInit() {
    this.queue.process('emails', async (job) => {
      if (job.name === 'welcome') {
        await this.processWelcomeEmail(job.data);
      }
    });
  }
}
```

## Next Steps

- [HTTP](./http) - HTTP utilities
- [Security](./security) - Security features
- [Services](../building-blocks/services) - Creating services

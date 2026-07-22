# Lifecycle Hooks

Understand how Nyala manages the application lifecycle and how to hook into different stages.

## Application Lifecycle

```
Application Start
    ↓
Module Initialization
    ↓
Provider Instantiation
    ↓
OnModuleInit Hooks
    ↓
Application Ready
    ↓
OnApplicationBootstrap Hooks
    ↓
Application Running
    ↓
Shutdown Signal (SIGTERM/SIGINT)
    ↓
BeforeApplicationShutdown Hooks
    ↓
OnApplicationShutdown Hooks
    ↓
OnModuleDestroy Hooks
    ↓
Application Terminated
```

## Lifecycle Interfaces

### OnModuleInit

Executed when the module is initialized:

```typescript
import { Injectable, OnModuleInit } from '@nyala/core';

@Injectable()
export class DatabaseService implements OnModuleInit {
  async onModuleInit() {
    console.log('Module initialized - connecting to database');
    await this.connect();
  }

  private async connect() {
    // Database connection logic
  }
}
```

### OnApplicationBootstrap

Executed when the application is fully bootstrapped:

```typescript
import { Injectable, OnApplicationBootstrap } from '@nyala/core';

@Injectable()
export class CacheService implements OnApplicationBootstrap {
  async onApplicationBootstrap() {
    console.log('Application bootstrapped - warming up cache');
    await this.warmCache();
  }

  private async warmCache() {
    // Pre-load frequently accessed data
  }
}
```

### OnModuleDestroy

Executed before the module is destroyed:

```typescript
import { Injectable, OnModuleDestroy } from '@nyala/core';

@Injectable()
export class SubscriptionService implements OnModuleDestroy {
  async onModuleDestroy() {
    console.log('Module destroying - cleaning up subscriptions');
    await this.cleanup();
  }

  private async cleanup() {
    // Unsubscribe from events, close connections
  }
}
```

### BeforeApplicationShutdown

Executed before application shutdown starts:

```typescript
import { Injectable, BeforeApplicationShutdown } from '@nyala/core';

@Injectable()
export class QueueService implements BeforeApplicationShutdown {
  async beforeApplicationShutdown(signal?: string) {
    console.log(`Shutdown signal received: ${signal}`);
    console.log('Finishing pending jobs');
    await this.finishPendingJobs();
  }

  private async finishPendingJobs() {
    // Complete in-progress work
  }
}
```

### OnApplicationShutdown

Executed during application shutdown:

```typescript
import { Injectable, OnApplicationShutdown } from '@nyala/core';

@Injectable()
export class DatabaseService implements OnApplicationShutdown {
  async onApplicationShutdown(signal?: string) {
    console.log(`Shutting down: ${signal}`);
    await this.disconnect();
  }

  private async disconnect() {
    // Close database connections
  }
}
```

## Complete Example

```typescript
import {
  Injectable,
  OnModuleInit,
  OnApplicationBootstrap,
  OnModuleDestroy,
  BeforeApplicationShutdown,
  OnApplicationShutdown,
} from '@nyala/core';

@Injectable()
export class AppService
  implements
    OnModuleInit,
    OnApplicationBootstrap,
    BeforeApplicationShutdown,
    OnApplicationShutdown,
    OnModuleDestroy
{
  async onModuleInit() {
    console.log('1. Module initialized');
  }

  async onApplicationBootstrap() {
    console.log('2. Application bootstrapped');
  }

  async beforeApplicationShutdown(signal?: string) {
    console.log('3. Before shutdown:', signal);
  }

  async onApplicationShutdown(signal?: string) {
    console.log('4. Application shutting down:', signal);
  }

  async onModuleDestroy() {
    console.log('5. Module destroyed');
  }
}
```

## Graceful Shutdown

Handle shutdown signals properly:

```typescript
// main.ts
import { NyalaFactory } from '@nyala/core';
import { AppModule } from './app/app.module';

async function bootstrap() {
  const app = await NyalaFactory.create(AppModule);

  // Enable graceful shutdown
  app.enableShutdownHooks();

  await app.listen(3000);
  console.log('Application running on port 3000');
}

bootstrap();
```

### Custom Shutdown Handling

```typescript
@Injectable()
export class ConnectionManager implements OnApplicationShutdown {
  private connections: Connection[] = [];

  async onApplicationShutdown(signal?: string) {
    console.log(`Closing ${this.connections.length} connections`);

    // Close all connections with timeout
    await Promise.all(
      this.connections.map(conn =>
        Promise.race([
          conn.close(),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Timeout')), 5000)
          ),
        ])
      )
    );
  }

  addConnection(conn: Connection) {
    this.connections.push(conn);
  }
}
```

## Request Lifecycle

```
Incoming Request
    ↓
Middleware (Global)
    ↓
Guards (Route)
    ↓
Interceptors (Before)
    ↓
Pipes (Validation)
    ↓
Controller Handler
    ↓
Service Logic
    ↓
Repository Access
    ↓
Database Query
    ↓
Repository Return
    ↓
Service Return
    ↓
Controller Return
    ↓
Interceptors (After)
    ↓
Response Sent
```

## Best Practices

### 1. Resource Cleanup

Always clean up resources:

```typescript
@Injectable()
export class RedisService implements OnApplicationShutdown {
  private client: RedisClient;

  async onModuleInit() {
    this.client = await createRedisClient();
  }

  async onApplicationShutdown() {
    if (this.client) {
      await this.client.quit();
    }
  }
}
```

### 2. Async Operations

Handle async operations properly:

```typescript
@Injectable()
export class DataService implements OnApplicationBootstrap {
  async onApplicationBootstrap() {
    try {
      await this.loadInitialData();
      console.log('Initial data loaded');
    } catch (error) {
      console.error('Failed to load initial data:', error);
      // Decide whether to fail fast or continue
      process.exit(1);
    }
  }
}
```

### 3. Timeouts

Set timeouts for shutdown operations:

```typescript
@Injectable()
export class WorkerService implements BeforeApplicationShutdown {
  async beforeApplicationShutdown(signal?: string) {
    const timeout = 10000; // 10 seconds

    await Promise.race([
      this.finishWork(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Shutdown timeout')), timeout)
      ),
    ]);
  }
}
```

### 4. Order Matters

Be aware of initialization order:

```typescript
// Database service initializes first
@Injectable()
export class DatabaseService implements OnModuleInit {
  async onModuleInit() {
    await this.connect();
  }
}

// Cache service depends on database
@Injectable()
export class CacheService implements OnApplicationBootstrap {
  constructor(private db: DatabaseService) {}

  async onApplicationBootstrap() {
    // Database is already connected
    await this.warmCache();
  }
}
```

### 5. Error Handling

Handle errors gracefully:

```typescript
@Injectable()
export class StartupService implements OnModuleInit {
  async onModuleInit() {
    try {
      await this.initialize();
    } catch (error) {
      console.error('Initialization failed:', error);
      // Log error but don't crash
      // Or exit if critical
      if (this.isCriticalError(error)) {
        process.exit(1);
      }
    }
  }

  private isCriticalError(error: Error): boolean {
    return error.message.includes('database') ||
           error.message.includes('configuration');
  }
}
```

## Use Cases

### Database Connection

```typescript
@Injectable()
export class DatabaseService
  implements OnModuleInit, OnApplicationShutdown
{
  private connection: Connection;

  async onModuleInit() {
    this.connection = await createConnection({
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT),
    });
    console.log('Database connected');
  }

  async onApplicationShutdown() {
    if (this.connection) {
      await this.connection.close();
      console.log('Database disconnected');
    }
  }
}
```

### Cache Warming

```typescript
@Injectable()
export class CacheService implements OnApplicationBootstrap {
  constructor(
    private redis: RedisService,
    private productRepo: ProductRepository
  ) {}

  async onApplicationBootstrap() {
    console.log('Warming cache...');
    const products = await this.productRepo.findPopular();

    for (const product of products) {
      await this.redis.set(
        `product:${product.id}`,
        JSON.stringify(product),
        3600
      );
    }

    console.log(`Cached ${products.length} products`);
  }
}
```

### Background Jobs

```typescript
@Injectable()
export class JobScheduler
  implements OnApplicationBootstrap, BeforeApplicationShutdown
{
  private jobs: NodeJS.Timeout[] = [];

  async onApplicationBootstrap() {
    // Start scheduled jobs
    this.jobs.push(
      setInterval(() => this.cleanupExpiredSessions(), 60000)
    );
    this.jobs.push(
      setInterval(() => this.sendDigestEmails(), 3600000)
    );
    console.log('Background jobs started');
  }

  async beforeApplicationShutdown() {
    // Stop all jobs
    this.jobs.forEach(job => clearInterval(job));
    console.log('Background jobs stopped');
  }

  private async cleanupExpiredSessions() {
    // Cleanup logic
  }

  private async sendDigestEmails() {
    // Email logic
  }
}
```

### Health Checks

```typescript
@Injectable()
export class HealthService implements OnModuleInit {
  private services: Map<string, boolean> = new Map();

  async onModuleInit() {
    await this.checkServices();
    setInterval(() => this.checkServices(), 30000);
  }

  private async checkServices() {
    this.services.set('database', await this.checkDatabase());
    this.services.set('redis', await this.checkRedis());
    this.services.set('api', await this.checkExternalApi());
  }

  getHealthStatus() {
    return {
      status: Array.from(this.services.values()).every(v => v)
        ? 'healthy'
        : 'unhealthy',
      services: Object.fromEntries(this.services),
    };
  }
}
```

## Next Steps

- [Controllers](../building-blocks/controllers) - HTTP request handling
- [Services](../building-blocks/services) - Business logic
- [Middleware](../building-blocks/middleware) - Request processing

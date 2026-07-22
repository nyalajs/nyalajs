# Configuration

Nyala uses environment variables for configuration, following the twelve-factor app methodology.

## Environment Files

### Development

Create a `.env` file in your project root:

```env
# Application
PORT=3000
NODE_ENV=development
APP_URL=http://localhost:3000
APP_NAME=My Nyala App

# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=nyala_app
DB_USER=postgres
DB_PASSWORD=your_password
DB_SSL=false

# Authentication
JWT_SECRET=your-super-secret-jwt-key-minimum-32-characters
JWT_EXPIRES_IN=15m
JWT_REFRESH_SECRET=your-refresh-secret-key-minimum-32-characters
JWT_REFRESH_EXPIRES_IN=7d

# Multi-Tenancy (SaaS only)
TENANT_HEADER=X-Tenant-ID
DEFAULT_TENANT=default

# Logging
LOG_LEVEL=debug
LOG_FORMAT=pretty

# CORS
CORS_ORIGIN=http://localhost:3000
CORS_CREDENTIALS=true

# Rate Limiting
RATE_LIMIT_WINDOW=15m
RATE_LIMIT_MAX=100

# File Upload
MAX_FILE_SIZE=10mb
UPLOAD_DIR=./uploads

# Email (optional)
SMTP_HOST=smtp.mailtrap.io
SMTP_PORT=2525
SMTP_USER=your_username
SMTP_PASSWORD=your_password
SMTP_FROM=noreply@example.com

# Redis (optional)
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0
```

### Production

Create a `.env.production` file:

```env
NODE_ENV=production
PORT=8080
APP_URL=https://api.yourapp.com

# Use strong secrets in production
JWT_SECRET=generate-with-openssl-rand-base64-32
JWT_REFRESH_SECRET=generate-with-openssl-rand-base64-32

# Enable production optimizations
LOG_LEVEL=info
LOG_FORMAT=json

# Database with SSL
DB_SSL=true
DB_SSL_REJECT_UNAUTHORIZED=true
```

## Configuration Options

### Application

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | 3000 |
| `NODE_ENV` | Environment | development |
| `APP_URL` | Base URL | http://localhost:3000 |
| `APP_NAME` | Application name | Nyala App |

### Database

| Variable | Description | Default |
|----------|-------------|---------|
| `DB_HOST` | Database host | localhost |
| `DB_PORT` | Database port | 5432 |
| `DB_NAME` | Database name | nyala |
| `DB_USER` | Database user | postgres |
| `DB_PASSWORD` | Database password | - |
| `DB_SSL` | Enable SSL | false |

### Authentication

| Variable | Description | Default |
|----------|-------------|---------|
| `JWT_SECRET` | JWT signing secret | - (required) |
| `JWT_EXPIRES_IN` | Access token expiry | 15m |
| `JWT_REFRESH_SECRET` | Refresh token secret | - (required) |
| `JWT_REFRESH_EXPIRES_IN` | Refresh token expiry | 7d |

### Multi-Tenancy

| Variable | Description | Default |
|----------|-------------|---------|
| `TENANT_HEADER` | HTTP header for tenant ID | X-Tenant-ID |
| `DEFAULT_TENANT` | Default tenant slug | default |

### Logging

| Variable | Description | Default |
|----------|-------------|---------|
| `LOG_LEVEL` | Log level (debug, info, warn, error) | info |
| `LOG_FORMAT` | Log format (json, pretty) | json |

### CORS

| Variable | Description | Default |
|----------|-------------|---------|
| `CORS_ORIGIN` | Allowed origins (comma-separated) | * |
| `CORS_CREDENTIALS` | Allow credentials | false |

### Rate Limiting

| Variable | Description | Default |
|----------|-------------|---------|
| `RATE_LIMIT_WINDOW` | Time window | 15m |
| `RATE_LIMIT_MAX` | Max requests per window | 100 |

## Programmatic Configuration

### Custom Configuration File

Create `config/app.config.ts`:

```typescript
interface AppConfig {
  port: number;
  environment: string;
  database: {
    host: string;
    port: number;
    name: string;
    user: string;
    password: string;
    ssl: boolean;
  };
  jwt: {
    secret: string;
    expiresIn: string;
    refreshSecret: string;
    refreshExpiresIn: string;
  };
}

export const appConfig: AppConfig = {
  port: parseInt(process.env.PORT || '3000'),
  environment: process.env.NODE_ENV || 'development',
  database: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    name: process.env.DB_NAME || 'nyala',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    ssl: process.env.DB_SSL === 'true',
  },
  jwt: {
    secret: process.env.JWT_SECRET || '',
    expiresIn: process.env.JWT_EXPIRES_IN || '15m',
    refreshSecret: process.env.JWT_REFRESH_SECRET || '',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  },
};
```

### Use Configuration

```typescript
import { appConfig } from './config/app.config';

@Injectable()
export class SomeService {
  private readonly jwtSecret = appConfig.jwt.secret;

  someMethod() {
    // Use configuration
  }
}
```

## Validation

Validate environment variables on startup:

```typescript
// config/env.validator.ts
import { z } from 'zod';

const envSchema = z.object({
  PORT: z.string().transform(Number),
  NODE_ENV: z.enum(['development', 'production', 'test']),
  DB_HOST: z.string(),
  DB_PORT: z.string().transform(Number),
  DB_NAME: z.string(),
  DB_USER: z.string(),
  DB_PASSWORD: z.string(),
  JWT_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
});

export function validateEnv() {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    console.error('❌ Invalid environment variables:');
    console.error(result.error.format());
    process.exit(1);
  }

  return result.data;
}
```

Use in `main.ts`:

```typescript
import { validateEnv } from './config/env.validator';

async function bootstrap() {
  // Validate environment
  const env = validateEnv();

  // Start application
  const app = await NyalaFactory.create(AppModule);
  await app.listen(env.PORT);
}
```

## Secrets Management

### Development

Use `.env` file (never commit it):

```bash
# Add to .gitignore
.env
.env.local
.env.*.local
```

### Production

Use environment variables or secrets management:

**Docker:**

```yaml
# docker-compose.yml
services:
  app:
    environment:
      - JWT_SECRET=${JWT_SECRET}
      - DB_PASSWORD=${DB_PASSWORD}
```

**Kubernetes:**

```yaml
# secret.yaml
apiVersion: v1
kind: Secret
metadata:
  name: app-secrets
type: Opaque
data:
  jwt-secret: <base64-encoded>
  db-password: <base64-encoded>
```

**AWS Secrets Manager:**

```typescript
import { SecretsManager } from 'aws-sdk';

const client = new SecretsManager({ region: 'us-east-1' });

async function getSecret(name: string) {
  const result = await client.getSecretValue({ SecretId: name }).promise();
  return JSON.parse(result.SecretString);
}
```

## Environment-Specific Configuration

### Load Different Configs

```typescript
// config/index.ts
import { devConfig } from './dev.config';
import { prodConfig } from './prod.config';
import { testConfig } from './test.config';

const configs = {
  development: devConfig,
  production: prodConfig,
  test: testConfig,
};

export const config = configs[process.env.NODE_ENV || 'development'];
```

### Override Configuration

```typescript
// config/prod.config.ts
import { appConfig } from './app.config';

export const prodConfig = {
  ...appConfig,
  database: {
    ...appConfig.database,
    pool: {
      min: 10,
      max: 50,
    },
  },
  cache: {
    enabled: true,
    ttl: 3600,
  },
};
```

## Best Practices

### 1. Never Commit Secrets

```bash
# .gitignore
.env
.env.local
.env.production
.env.*.local
```

### 2. Use Strong Secrets

Generate secure keys:

```bash
# Generate JWT secret
openssl rand -base64 32

# Or use Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

### 3. Validate on Startup

Always validate required environment variables:

```typescript
const required = ['JWT_SECRET', 'DB_PASSWORD', 'JWT_REFRESH_SECRET'];

for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}
```

### 4. Document Variables

Keep `.env.example` updated:

```env
# .env.example
JWT_SECRET=generate-with-openssl
DB_PASSWORD=your-database-password
```

### 5. Use Type-Safe Configuration

```typescript
class ConfigService {
  get<T = string>(key: string, defaultValue?: T): T {
    const value = process.env[key];
    if (value === undefined) {
      if (defaultValue !== undefined) return defaultValue;
      throw new Error(`Configuration key "${key}" is required`);
    }
    return value as T;
  }

  getNumber(key: string, defaultValue?: number): number {
    const value = this.get(key, defaultValue?.toString());
    return parseInt(value, 10);
  }

  getBoolean(key: string, defaultValue?: boolean): boolean {
    const value = this.get(key, defaultValue?.toString());
    return value === 'true';
  }
}
```

## Next Steps

- [Deployment](./deployment/checklist) - Production deployment
- [Security](./features/authentication) - Security best practices
- [Environment Variables](./deployment/environment) - Advanced configuration

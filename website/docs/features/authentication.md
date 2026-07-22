# Authentication

Nyala provides built-in JWT authentication with refresh tokens, password hashing, and secure defaults.

## Quick Start

The MVC and SaaS templates include complete authentication out of the box:

```bash
# Register
POST /auth/register
{
  "email": "user@example.com",
  "password": "SecurePass123!",
  "name": "John Doe"
}

# Login
POST /auth/login
{
  "email": "user@example.com",
  "password": "SecurePass123!"
}

# Refresh token
POST /auth/refresh
{
  "refreshToken": "..."
}

# Logout
POST /auth/logout
```

## Auth Controller

```typescript
import { Controller, Post, Body, UseValidation } from '@nyala/core';
import { AuthService } from '../services/auth.service';
import { RegisterDto, LoginDto } from '../dto/auth';
import { RegisterValidator, LoginValidator } from '../validators/auth';

@Controller('/auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('/register')
  @UseValidation(RegisterValidator)
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('/login')
  @UseValidation(LoginValidator)
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('/refresh')
  async refresh(@Body('refreshToken') refreshToken: string) {
    return this.authService.refresh(refreshToken);
  }

  @Post('/logout')
  @UseGuards(AuthGuard)
  async logout(@CurrentUser() user: User) {
    return this.authService.logout(user.id);
  }
}
```

## Auth Service

```typescript
import { Injectable, UnauthorizedException, ConflictException } from '@nyala/core';
import { JwtService } from '@nyala/jwt';
import { UsersRepository } from '../repositories/users.repository';
import { hashPassword, comparePassword } from '../helpers/password.helper';

@Injectable()
export class AuthService {
  constructor(
    private usersRepo: UsersRepository,
    private jwtService: JwtService
  ) {}

  async register(dto: RegisterDto) {
    // Check if user exists
    const existing = await this.usersRepo.findByEmail(dto.email);
    if (existing) {
      throw new ConflictException('Email already registered');
    }

    // Hash password
    const hashedPassword = await hashPassword(dto.password);

    // Create user
    const user = await this.usersRepo.create({
      email: dto.email,
      password: hashedPassword,
      name: dto.name,
    });

    // Generate tokens
    const { accessToken, refreshToken } = await this.generateTokens(user.id);

    return {
      user: this.sanitizeUser(user),
      accessToken,
      refreshToken,
    };
  }

  async login(dto: LoginDto) {
    // Find user
    const user = await this.usersRepo.findByEmail(dto.email);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Verify password
    const isValid = await comparePassword(dto.password, user.password);
    if (!isValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Check if user is active
    if (!user.active) {
      throw new UnauthorizedException('Account is inactive');
    }

    // Generate tokens
    const { accessToken, refreshToken } = await this.generateTokens(user.id);

    return {
      user: this.sanitizeUser(user),
      accessToken,
      refreshToken,
    };
  }

  async refresh(refreshToken: string) {
    try {
      const payload = this.jwtService.verify(refreshToken, {
        secret: process.env.JWT_REFRESH_SECRET,
      });

      const user = await this.usersRepo.findById(payload.sub);
      if (!user || !user.active) {
        throw new UnauthorizedException('Invalid token');
      }

      const { accessToken, refreshToken: newRefreshToken } =
        await this.generateTokens(user.id);

      return {
        accessToken,
        refreshToken: newRefreshToken,
      };
    } catch (error) {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  async logout(userId: string) {
    // Invalidate refresh tokens (implementation depends on storage)
    return { message: 'Logged out successfully' };
  }

  private async generateTokens(userId: string) {
    const payload = { sub: userId };

    const accessToken = this.jwtService.sign(payload, {
      secret: process.env.JWT_SECRET,
      expiresIn: process.env.JWT_EXPIRES_IN || '15m',
    });

    const refreshToken = this.jwtService.sign(payload, {
      secret: process.env.JWT_REFRESH_SECRET,
      expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
    });

    return { accessToken, refreshToken };
  }

  private sanitizeUser(user: User) {
    const { password, ...sanitized } = user;
    return sanitized;
  }
}
```

## Auth Guard

Protect routes with the auth guard:

```typescript
import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nyala/core';
import { JwtService } from '@nyala/jwt';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const token = this.extractToken(request);

    if (!token) {
      throw new UnauthorizedException('No token provided');
    }

    try {
      const payload = this.jwtService.verify(token);
      request.user = payload;
      return true;
    } catch (error) {
      throw new UnauthorizedException('Invalid token');
    }
  }

  private extractToken(request: any): string | null {
    const authHeader = request.headers.authorization;
    if (!authHeader) return null;

    const [type, token] = authHeader.split(' ');
    return type === 'Bearer' ? token : null;
  }
}
```

## Using Auth Guard

### Protect Controller

```typescript
@Controller('/users')
@UseGuards(AuthGuard)  // All routes protected
export class UsersController {
  @Get('/profile')
  async getProfile(@CurrentUser() user: User) {
    return user;
  }

  @Get('/public')
  @Public()  // Allow public access
  async publicRoute() {
    return { message: 'Public data' };
  }
}
```

### Protect Specific Routes

```typescript
@Controller('/posts')
export class PostsController {
  @Get('/')
  @Public()  // Public
  async index() {
    return this.postsService.findAll();
  }

  @Post('/')
  @UseGuards(AuthGuard)  // Protected
  async create(@Body() dto: CreatePostDto, @CurrentUser() user: User) {
    return this.postsService.create(dto, user.id);
  }
}
```

## Current User Decorator

Get the current user in controllers:

```typescript
import { createParamDecorator, ExecutionContext } from '@nyala/core';

export const CurrentUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  }
);

// Usage
@Get('/profile')
@UseGuards(AuthGuard)
async getProfile(@CurrentUser() user: User) {
  return user;
}
```

## Password Hashing

Use bcrypt for password hashing:

```typescript
// helpers/password.helper.ts
import * as bcrypt from 'bcrypt';

const SALT_ROUNDS = 10;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function comparePassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
```

## JWT Configuration

Configure JWT in environment:

```env
# JWT Access Token
JWT_SECRET=your-super-secret-key-minimum-32-characters
JWT_EXPIRES_IN=15m

# JWT Refresh Token
JWT_REFRESH_SECRET=your-refresh-secret-key-minimum-32-characters
JWT_REFRESH_EXPIRES_IN=7d
```

## Email Verification

Add email verification:

```typescript
@Injectable()
export class AuthService {
  constructor(
    private usersRepo: UsersRepository,
    private emailService: EmailService,
    private jwtService: JwtService
  ) {}

  async register(dto: RegisterDto) {
    const user = await this.createUser(dto);

    // Generate verification token
    const verificationToken = this.jwtService.sign(
      { sub: user.id, type: 'email_verification' },
      { expiresIn: '24h' }
    );

    // Send verification email
    await this.emailService.sendVerification(user.email, verificationToken);

    return {
      message: 'Registration successful. Please verify your email.',
      user: this.sanitizeUser(user),
    };
  }

  async verifyEmail(token: string) {
    try {
      const payload = this.jwtService.verify(token);

      if (payload.type !== 'email_verification') {
        throw new BadRequestException('Invalid token type');
      }

      const user = await this.usersRepo.update(payload.sub, {
        emailVerified: true,
      });

      return {
        message: 'Email verified successfully',
        user: this.sanitizeUser(user),
      };
    } catch (error) {
      throw new BadRequestException('Invalid or expired token');
    }
  }
}
```

## Password Reset

Implement password reset:

```typescript
@Injectable()
export class AuthService {
  async requestPasswordReset(email: string) {
    const user = await this.usersRepo.findByEmail(email);
    if (!user) {
      // Don't reveal if email exists
      return { message: 'If the email exists, a reset link has been sent' };
    }

    // Generate reset token
    const resetToken = this.jwtService.sign(
      { sub: user.id, type: 'password_reset' },
      { expiresIn: '1h' }
    );

    // Send reset email
    await this.emailService.sendPasswordReset(user.email, resetToken);

    return { message: 'Password reset email sent' };
  }

  async resetPassword(token: string, newPassword: string) {
    try {
      const payload = this.jwtService.verify(token);

      if (payload.type !== 'password_reset') {
        throw new BadRequestException('Invalid token type');
      }

      const hashedPassword = await hashPassword(newPassword);
      await this.usersRepo.update(payload.sub, {
        password: hashedPassword,
      });

      return { message: 'Password reset successful' };
    } catch (error) {
      throw new BadRequestException('Invalid or expired token');
    }
  }
}
```

## Session Management

Track active sessions:

```typescript
@Injectable()
export class SessionService {
  constructor(private redis: RedisService) {}

  async createSession(userId: string, refreshToken: string) {
    const sessionId = generateId();
    await this.redis.set(
      `session:${sessionId}`,
      JSON.stringify({ userId, refreshToken }),
      7 * 24 * 60 * 60 // 7 days
    );
    return sessionId;
  }

  async getSession(sessionId: string) {
    const data = await this.redis.get(`session:${sessionId}`);
    return data ? JSON.parse(data) : null;
  }

  async deleteSession(sessionId: string) {
    await this.redis.delete(`session:${sessionId}`);
  }

  async deleteUserSessions(userId: string) {
    const keys = await this.redis.keys(`session:*`);
    for (const key of keys) {
      const session = await this.getSession(key.replace('session:', ''));
      if (session?.userId === userId) {
        await this.redis.delete(key);
      }
    }
  }
}
```

## Social Authentication

Add OAuth providers:

```typescript
@Controller('/auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private oauthService: OAuthService
  ) {}

  @Get('/google')
  async googleAuth(@Res() res: Response) {
    const authUrl = this.oauthService.getGoogleAuthUrl();
    res.redirect(authUrl);
  }

  @Get('/google/callback')
  async googleCallback(@Query('code') code: string) {
    const profile = await this.oauthService.getGoogleProfile(code);
    return this.authService.socialLogin('google', profile);
  }
}
```

## Best Practices

### 1. Never Store Plain Passwords

```typescript
// ✅ Good: Hash passwords
const hashedPassword = await hashPassword(dto.password);
await this.usersRepo.create({ ...dto, password: hashedPassword });

// ❌ Bad: Plain text passwords
await this.usersRepo.create(dto);
```

### 2. Use Strong Secrets

```bash
# Generate secure secrets
openssl rand -base64 32
```

### 3. Short-Lived Access Tokens

```env
# ✅ Good: Short expiry
JWT_EXPIRES_IN=15m

# ❌ Bad: Long expiry
JWT_EXPIRES_IN=30d
```

### 4. Sanitize User Objects

```typescript
// ✅ Good: Remove sensitive data
function sanitize(user: User) {
  const { password, resetToken, ...safe } = user;
  return safe;
}

// ❌ Bad: Return everything
return user;
```

### 5. Rate Limit Auth Endpoints

```typescript
@Controller('/auth')
@UseGuards(RateLimitGuard)
export class AuthController {
  // Protected from brute force attacks
}
```

## Next Steps

- [Authorization](./authorization) - Role-based access control
- [Validation](./validation) - Input validation
- [Error Handling](./error-handling) - Error management

# SaaS Application Example

Multi-tenant SaaS platform with Nyala.

## Features

- Multi-tenancy with data isolation
- Tenant onboarding
- Subscription management
- Team management
- Role-based permissions
- Audit logging
- Usage tracking
- API limits per plan

## Quick Start

```bash
nyala new my-saas --template=saas
cd my-saas
npm install
npm run dev
```

## Tenant Management

```typescript
@Controller('/tenants')
export class TenantsController {
  @Post('/')
  async create(@Body() dto: CreateTenantDto) {
    return this.tenantsService.create(dto);
  }

  @Get('/:id')
  @UseGuards(AuthGuard, TenantGuard)
  async show(@Param('id') id: string) {
    return this.tenantsService.findById(id);
  }

  @Put('/:id/subscription')
  @UseGuards(AuthGuard, AdminGuard)
  async updateSubscription(
    @Param('id') id: string,
    @Body() dto: UpdateSubscriptionDto
  ) {
    return this.tenantsService.updateSubscription(id, dto);
  }
}
```

## Data Isolation

```typescript
@Injectable()
export class UsersRepository extends TenantRepository<User> {
  constructor(tenantContext: TenantContext) {
    super(users, tenantContext);
  }

  // Automatically scoped to current tenant
  async findByEmail(email: string) {
    return this.findOne(eq(users.email, email));
  }
}
```

## Subscription Management

```typescript
@Injectable()
export class SubscriptionsService {
  async create(tenantId: string, planId: string) {
    const plan = await this.plansService.findById(planId);

    // Create Stripe subscription
    const subscription = await this.stripe.subscriptions.create({
      customer: tenant.stripeCustomerId,
      items: [{ price: plan.stripePriceId }],
    });

    // Update tenant
    await this.tenantsRepo.update(tenantId, {
      planId,
      subscriptionId: subscription.id,
      subscriptionStatus: 'active',
    });

    return subscription;
  }

  async cancel(tenantId: string) {
    const tenant = await this.tenantsRepo.findById(tenantId);

    await this.stripe.subscriptions.cancel(tenant.subscriptionId);

    await this.tenantsRepo.update(tenantId, {
      subscriptionStatus: 'cancelled',
    });
  }
}
```

## Team Management

```typescript
@Controller('/team')
@UseGuards(AuthGuard, TenantGuard)
export class TeamController {
  @Get('/members')
  async listMembers(@CurrentTenant() tenant: Tenant) {
    return this.teamService.getMembers(tenant.id);
  }

  @Post('/members')
  @Roles('admin', 'owner')
  async inviteMember(
    @CurrentTenant() tenant: Tenant,
    @Body() dto: InviteMemberDto
  ) {
    return this.teamService.invite(tenant.id, dto);
  }

  @Delete('/members/:userId')
  @Roles('admin', 'owner')
  async removeMember(
    @CurrentTenant() tenant: Tenant,
    @Param('userId') userId: string
  ) {
    return this.teamService.remove(tenant.id, userId);
  }
}
```

## Usage Tracking

```typescript
@Injectable()
export class UsageTrackingService {
  async track(tenantId: string, metric: string, value: number = 1) {
    await this.usageRepo.increment(tenantId, metric, value);

    // Check limits
    const plan = await this.getTenantsService().getPlan(tenantId);
    const usage = await this.usageRepo.getTotal(tenantId, metric);

    if (usage > plan.limits[metric]) {
      throw new ForbiddenException(`${metric} limit exceeded`);
    }
  }
}

// Usage in controller
@Post('/api/requests')
@UseGuards(AuthGuard, TenantGuard)
async create(@CurrentTenant() tenant: Tenant) {
  await this.usageService.track(tenant.id, 'api_requests');
  // Process request
}
```

## API Features

### Tenant Onboarding
- `POST /tenants` - Create new tenant
- `POST /tenants/:id/setup` - Complete setup wizard
- `POST /tenants/:id/verify` - Verify tenant

### Subscription
- `GET /subscription` - Get current subscription
- `POST /subscription` - Create subscription
- `PUT /subscription` - Update subscription
- `DELETE /subscription` - Cancel subscription

### Team
- `GET /team/members` - List team members
- `POST /team/members` - Invite member
- `PUT /team/members/:id` - Update member role
- `DELETE /team/members/:id` - Remove member

### Usage
- `GET /usage` - Get current usage
- `GET /usage/history` - Usage history

## Source Code

Full source: [github.com/nyalajs/examples/saas](https://github.com/nyalajs/examples/tree/main/saas)

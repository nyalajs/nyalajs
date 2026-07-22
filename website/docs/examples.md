# Examples

Real-world examples built with Nyala.

## Available Examples

### [Blog API](./examples/blog-api)

Complete blog platform with authentication, posts, comments, and categories.

**Features:**
- User authentication
- CRUD operations for posts
- Comments system
- Categories and tags
- Slug-based URLs

**Tech Stack:** Nyala, PostgreSQL, JWT

[View Example →](./examples/blog-api)

---

### [E-commerce Platform](./examples/ecommerce)

Full-featured e-commerce application with products, cart, and payments.

**Features:**
- Product catalog
- Shopping cart
- Order management
- Payment processing (Stripe)
- Inventory management
- Admin dashboard

**Tech Stack:** Nyala, PostgreSQL, Stripe, Redis

[View Example →](./examples/ecommerce)

---

### [SaaS Application](./examples/saas)

Multi-tenant SaaS platform with subscription management.

**Features:**
- Multi-tenancy with data isolation
- Subscription management
- Team collaboration
- Usage tracking
- Role-based permissions

**Tech Stack:** Nyala, PostgreSQL, Stripe

[View Example →](./examples/saas)

---

### [Microservices](./examples/microservices)

Microservices architecture with API gateway and service communication.

**Features:**
- API Gateway
- Service discovery
- Inter-service communication
- Load balancing
- Circuit breaker pattern

**Tech Stack:** Nyala, Redis, Docker

[View Example →](./examples/microservices)

---

## Getting Started with Examples

### Clone the Repository

```bash
git clone https://github.com/nyalajs/examples
cd examples
```

### Choose an Example

```bash
# Blog API
cd blog-api

# E-commerce
cd ecommerce

# SaaS
cd saas

# Microservices
cd microservices
```

### Install and Run

```bash
# Install dependencies
npm install

# Setup environment
cp .env.example .env

# Run migrations
npm run db:migrate

# Seed database
npm run db:seed

# Start development server
npm run dev
```

## Learning Path

If you're new to Nyala, we recommend following this order:

1. **[Blog API](./examples/blog-api)** - Start here to learn the basics
2. **[E-commerce](./examples/ecommerce)** - Learn advanced patterns
3. **[SaaS](./examples/saas)** - Master multi-tenancy
4. **[Microservices](./examples/microservices)** - Scale your architecture

## Community Examples

Want to share your example? Submit a PR to our [examples repository](https://github.com/nyalajs/examples)!

## Need Help?

- [Documentation](../introduction) - Full framework docs
- [Discord](https://discord.gg/nyalajs) - Community support
- [GitHub Issues](https://github.com/nyalajs/nyala/issues) - Report issues

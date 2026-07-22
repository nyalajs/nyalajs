# Quick Start

Get up and running with Nyala in under 5 minutes.

## Installation

Install the Nyala CLI:

```bash
npm install -g @nyalajs/cli
```

## Create Your App

Create a new application:

```bash
nyala new my-app
cd my-app
npm install
```

Configure your database in `.env`:

```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=my_app
DB_USER=postgres
DB_PASSWORD=your_password
JWT_SECRET=your-secret-key
```

Run migrations:

```bash
npm run db:migrate
```

Start the server:

```bash
npm run dev
```

Your app is running at [http://localhost:3000](http://localhost:3000)!

## Test the API

### Health Check

```bash
curl http://localhost:3000/health
```

### Register a User

```bash
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "Password123!",
    "name": "John Doe"
  }'
```

### Login

```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "Password123!"
  }'
```

Save the `accessToken` from the response.

### Get Users (Protected)

```bash
curl http://localhost:3000/users \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

## What's Next?

- [Build your first feature](./getting-started) - Complete tutorial
- [Understand the architecture](./concepts/architecture) - Core concepts
- [Explore templates](./cli/templates) - MVC and SaaS starters
- [Learn about multi-tenancy](./multi-tenancy/overview) - Building SaaS apps

## Need Help?

- [Documentation](./introduction) - Full guides and references
- [Discord](https://discord.gg/nyalajs) - Community support
- [GitHub](https://github.com/nyalajs/nyala) - Issues and discussions

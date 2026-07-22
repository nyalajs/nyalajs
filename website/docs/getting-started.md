# Getting Started

This guide will walk you through creating your first Nyala application and building a simple blog API.

## Prerequisites

Ensure you have:
- Node.js 18+ installed
- PostgreSQL running
- Nyala CLI installed globally

If not, check the [Installation Guide](./installation).

## Create Your Application

Create a new MVC application:

```bash
nyala new blog-api --template=mvc
cd blog-api
npm install
```

Configure your database in `.env`:

```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=blog_api
DB_USER=postgres
DB_PASSWORD=your_password
```

Run migrations:

```bash
npm run db:migrate
```

Start the server:

```bash
npm run dev
```

## Your First Feature: Blog Posts

Let's build a complete blog posts feature with CRUD operations.

### Step 1: Create the Model

Create the database schema:

```typescript
// database/schema/posts.schema.ts
import { pgTable, uuid, varchar, text, timestamp } from 'drizzle-orm/pg-core';

export const posts = pgTable('posts', {
  id: uuid('id').defaultRandom().primaryKey(),
  title: varchar('title', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 255 }).notNull().unique(),
  content: text('content').notNull(),
  authorId: uuid('author_id').notNull().references(() => users.id),
  publishedAt: timestamp('published_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export type Post = typeof posts.$inferSelect;
export type NewPost = typeof posts.$inferInsert;
```

Create a migration:

```bash
npm run db:generate
npm run db:migrate
```

### Step 2: Create the Repository

```typescript
// app/repositories/posts.repository.ts
import { Injectable } from '@nyala/core';
import { eq } from 'drizzle-orm';
import { BaseRepository } from './base.repository';
import { posts, Post } from '../../database/schema/posts.schema';

@Injectable()
export class PostsRepository extends BaseRepository<Post> {
  constructor() {
    super(posts);
  }

  async findBySlug(slug: string): Promise<Post | null> {
    return this.findOne(eq(posts.slug, slug));
  }

  async findPublished(): Promise<Post[]> {
    return this.findAll({
      where: isNotNull(posts.publishedAt)
    });
  }

  async publish(id: string): Promise<Post | null> {
    return this.update(id, { publishedAt: new Date() });
  }
}
```

### Step 3: Create DTOs

```typescript
// app/dto/posts/create-post.dto.ts
export interface CreatePostDto {
  title: string;
  content: string;
  authorId: string;
}

// app/dto/posts/update-post.dto.ts
export interface UpdatePostDto {
  title?: string;
  content?: string;
  publishedAt?: Date | null;
}
```

### Step 4: Create Validators

```typescript
// app/validators/posts/create-post.validator.ts
import { z } from 'zod';

export const CreatePostValidator = z.object({
  title: z.string().min(3).max(255),
  content: z.string().min(10),
  authorId: z.string().uuid(),
});

// app/validators/posts/update-post.validator.ts
export const UpdatePostValidator = z.object({
  title: z.string().min(3).max(255).optional(),
  content: z.string().min(10).optional(),
  publishedAt: z.date().nullable().optional(),
});
```

### Step 5: Create the Service

```typescript
// app/services/posts.service.ts
import { Injectable } from '@nyala/core';
import { PostsRepository } from '../repositories/posts.repository';
import { CreatePostDto, UpdatePostDto } from '../dto/posts';

@Injectable()
export class PostsService {
  constructor(private postsRepo: PostsRepository) {}

  async findAll() {
    return this.postsRepo.findAll();
  }

  async findById(id: string) {
    const post = await this.postsRepo.findById(id);
    if (!post) {
      throw new Error('Post not found');
    }
    return post;
  }

  async findBySlug(slug: string) {
    const post = await this.postsRepo.findBySlug(slug);
    if (!post) {
      throw new Error('Post not found');
    }
    return post;
  }

  async create(dto: CreatePostDto) {
    const slug = this.generateSlug(dto.title);
    return this.postsRepo.create({ ...dto, slug });
  }

  async update(id: string, dto: UpdatePostDto) {
    const post = await this.postsRepo.update(id, dto);
    if (!post) {
      throw new Error('Post not found');
    }
    return post;
  }

  async delete(id: string) {
    return this.postsRepo.delete(id);
  }

  async publish(id: string) {
    const post = await this.postsRepo.publish(id);
    if (!post) {
      throw new Error('Post not found');
    }
    return post;
  }

  private generateSlug(title: string): string {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }
}
```

### Step 6: Create the Controller

```typescript
// app/controllers/posts.controller.ts
import { Controller, Get, Post, Put, Delete, Body, Param, Query } from '@nyala/core';
import { UseValidation } from '@nyala/validation';
import { PostsService } from '../services/posts.service';
import { CreatePostDto, UpdatePostDto } from '../dto/posts';
import { CreatePostValidator, UpdatePostValidator } from '../validators/posts';

@Controller('/posts')
export class PostsController {
  constructor(private postsService: PostsService) {}

  @Get('/')
  async index() {
    return this.postsService.findAll();
  }

  @Get('/:id')
  async show(@Param('id') id: string) {
    return this.postsService.findById(id);
  }

  @Get('/slug/:slug')
  async showBySlug(@Param('slug') slug: string) {
    return this.postsService.findBySlug(slug);
  }

  @Post('/')
  @UseValidation(CreatePostValidator)
  async store(@Body() dto: CreatePostDto) {
    return this.postsService.create(dto);
  }

  @Put('/:id')
  @UseValidation(UpdatePostValidator)
  async update(
    @Param('id') id: string,
    @Body() dto: UpdatePostDto
  ) {
    return this.postsService.update(id, dto);
  }

  @Post('/:id/publish')
  async publish(@Param('id') id: string) {
    return this.postsService.publish(id);
  }

  @Delete('/:id')
  async destroy(@Param('id') id: string) {
    await this.postsService.delete(id);
    return { message: 'Post deleted successfully' };
  }
}
```

### Step 7: Register the Controller

```typescript
// app/app.module.ts
import { Module } from '@nyala/core';
import { PostsController } from './controllers/posts.controller';
import { PostsService } from './services/posts.service';
import { PostsRepository } from './repositories/posts.repository';

@Module({
  controllers: [PostsController],
  providers: [PostsService, PostsRepository],
})
export class AppModule {}
```

## Test Your API

### Create a Post

```bash
curl -X POST http://localhost:3000/posts \
  -H "Content-Type: application/json" \
  -d '{
    "title": "My First Blog Post",
    "content": "This is the content of my first blog post.",
    "authorId": "user-id-here"
  }'
```

### Get All Posts

```bash
curl http://localhost:3000/posts
```

### Get Post by ID

```bash
curl http://localhost:3000/posts/post-id-here
```

### Get Post by Slug

```bash
curl http://localhost:3000/posts/slug/my-first-blog-post
```

### Update a Post

```bash
curl -X PUT http://localhost:3000/posts/post-id-here \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Updated Title",
    "content": "Updated content"
  }'
```

### Publish a Post

```bash
curl -X POST http://localhost:3000/posts/post-id-here/publish
```

### Delete a Post

```bash
curl -X DELETE http://localhost:3000/posts/post-id-here
```

## What You Built

In just a few minutes, you created:

- ✅ Complete CRUD operations
- ✅ Database schema and migrations
- ✅ Repository for data access
- ✅ Service layer with business logic
- ✅ Controller with HTTP endpoints
- ✅ Request validation
- ✅ Type-safe DTOs

## Next Steps

<div class="next-steps">

**[Authentication →](./features/authentication)**
Protect your endpoints with JWT auth

**[Middleware →](./building-blocks/middleware)**
Add logging, rate limiting, and more

**[Testing →](./testing/overview)**
Write tests for your application

**[Deployment →](./deployment/checklist)**
Deploy to production

</div>

## Learn More

- [Controllers](./building-blocks/controllers) - HTTP request handling
- [Services](./building-blocks/services) - Business logic
- [Repositories](./building-blocks/repositories) - Data access patterns
- [Validation](./features/validation) - Request validation
- [Error Handling](./features/error-handling) - Graceful error management

<style>
.next-steps {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1rem;
  margin: 2rem 0;
}

.next-steps a {
  display: block;
  padding: 1rem;
  border: 1px solid var(--vp-c-divider);
  border-radius: 4px;
  text-decoration: none;
}

.next-steps a:hover {
  border-color: var(--vp-c-brand);
}

.next-steps strong {
  color: var(--vp-c-brand);
}
</style>

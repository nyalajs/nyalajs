# Quick Start

Get your first Nyala application running in 5 minutes.

## Step 1: Create Project

```bash
nyala new my-blog --template=mvc
cd my-blog
```

## Step 2: Install Dependencies

```bash
npm install
```

## Step 3: Configure Environment

```bash
cp .env.example .env
```

Edit `.env`:

```env
PORT=3000
DB_HOST=localhost
DB_NAME=my_blog
DB_USER=postgres
DB_PASSWORD=
JWT_SECRET=your-secret-key-here
```

## Step 4: Setup Database

```bash
npm run db:migrate
npm run db:seed
```

## Step 5: Start Server

```bash
npm run dev
```

Visit [http://localhost:3000/health](http://localhost:3000/health)

## Your First API Endpoint

The MVC template includes authentication out of the box. Try these:

### Register a User

```bash
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "John Doe",
    "email": "john@example.com",
    "password": "Password123"
  }'
```

### Login

```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "john@example.com",
    "password": "Password123"
  }'
```

### Get Users

```bash
curl http://localhost:3000/users \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

## Add Your First Feature

Let's create a blog posts feature:

### 1. Generate Components

```bash
nyala generate model Post
nyala generate controller Posts
nyala generate service Posts
nyala generate repository Post
```

### 2. Create Migration

```bash
nyala generate migration create_posts_table
```

Edit `database/migrations/XXXX_create_posts_table.ts`:

```typescript
export async function up(db: any) {
  await db.execute(sql`
    CREATE TABLE posts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      title VARCHAR(255) NOT NULL,
      content TEXT NOT NULL,
      author_id UUID REFERENCES users(id),
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );
  `);
}
```

### 3. Define Model

Edit `app/models/post.model.ts`:

```typescript
import { pgTable, uuid, varchar, text, timestamp } from "drizzle-orm/pg-core";

export const posts = pgTable("posts", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: varchar("title", { length: 255 }).notNull(),
  content: text("content").notNull(),
  authorId: uuid("author_id").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type Post = InferSelectModel<typeof posts>;
```

### 4. Implement Repository

Edit `app/repositories/post.repository.ts`:

```typescript
@Injectable()
export class PostRepository extends BaseRepository<Post> {
  constructor() {
    super(posts);
  }

  async findByAuthor(authorId: string): Promise<Post[]> {
    return this.findAll({
      where: eq(posts.authorId, authorId)
    });
  }
}
```

### 5. Implement Service

Edit `app/services/posts.service.ts`:

```typescript
@Injectable()
export class PostsService {
  constructor(
    private postRepo: PostRepository,
    private logger: Logger
  ) {}

  async create(dto: CreatePostDto): Promise<Post> {
    const post = await this.postRepo.create(dto);
    this.logger.info("Post created", { postId: post.id });
    return post;
  }

  async findAll(): Promise<Post[]> {
    return this.postRepo.findAll();
  }
}
```

### 6. Implement Controller

Edit `app/controllers/posts.controller.ts`:

```typescript
@Controller('/posts')
export class PostsController {
  constructor(private postsService: PostsService) {}

  @Get('/')
  async index() {
    return this.postsService.findAll();
  }

  @Post('/')
  async store(@Body() dto: CreatePostDto) {
    return this.postsService.create(dto);
  }
}
```

### 7. Register Components

Edit `bootstrap/app.module.ts`:

```typescript
@Module({
  providers: [
    // ... existing providers
    PostRepository,
    PostsService,
  ],
  controllers: [
    // ... existing controllers
    PostsController,
  ],
})
export class AppModule {}
```

### 8. Run Migration

```bash
npm run db:migrate
```

### 9. Test It

```bash
# Create a post
curl -X POST http://localhost:3000/posts \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "title": "My First Post",
    "content": "Hello Nyala!",
    "authorId": "USER_ID"
  }'

# Get all posts
curl http://localhost:3000/posts
```

## Next Steps

- [Architecture Guide](./architecture.md) - Understand MVC structure
- [Controllers](./controllers.md) - HTTP request handling
- [Services](./services.md) - Business logic
- [Repositories](./repositories.md) - Data access
- [Validation](./validation.md) - Request validation
- [Authentication](./authentication.md) - Securing endpoints
- [Multi-Tenancy](./multi-tenancy.md) - Building SaaS

## Common Tasks

### Add Validation

```typescript
// validators/post.validator.ts
export const CreatePostValidator = z.object({
  title: z.string().min(3).max(255),
  content: z.string().min(10),
  authorId: z.string().uuid(),
});

// In controller
@Post('/')
@UseValidation(CreatePostValidator)
async store(@Body() dto: CreatePostDto) {
  return this.postsService.create(dto);
}
```

### Add Authentication

```typescript
import { AuthGuard } from '@nyala/security';

@Controller('/posts')
@UseGuards(AuthGuard)
export class PostsController {
  // All endpoints now require authentication
}
```

### Add Pagination

```typescript
@Get('/')
async index(
  @Query('page') page: number = 1,
  @Query('limit') limit: number = 10
) {
  return this.postsService.findAll(page, limit);
}
```

## Troubleshooting

### Build Errors

```bash
rm -rf node_modules dist
npm install
npm run build
```

### Database Errors

```bash
# Reset database
npm run db:fresh
npm run db:seed
```

### Port in Use

```bash
# Change PORT in .env
PORT=3001
```

## Learn More

- [Full Documentation](./index.md)
- [CLI Commands](./cli-commands.md)
- [API Reference](./api-reference.md)
- [Examples](../examples)

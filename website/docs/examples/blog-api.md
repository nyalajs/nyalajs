# Blog API Example

Complete example of building a blog API with Nyala.

## Features

- User authentication
- Create, read, update, delete posts
- Comments on posts
- Categories and tags
- Like/unlike posts
- User profiles

## Project Structure

```
blog-api/
├── app/
│   ├── controllers/
│   │   ├── auth.controller.ts
│   │   ├── posts.controller.ts
│   │   ├── comments.controller.ts
│   │   └── users.controller.ts
│   ├── services/
│   │   ├── auth.service.ts
│   │   ├── posts.service.ts
│   │   └── comments.service.ts
│   ├── repositories/
│   │   ├── posts.repository.ts
│   │   └── comments.repository.ts
│   └── models/
│       ├── post.model.ts
│       ├── comment.model.ts
│       └── user.model.ts
└── database/
    ├── migrations/
    └── seeders/
```

## Database Schema

```typescript
// Post model
export const posts = pgTable('posts', {
  id: uuid('id').defaultRandom().primaryKey(),
  title: varchar('title', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 255 }).notNull().unique(),
  content: text('content').notNull(),
  excerpt: text('excerpt'),
  authorId: uuid('author_id').notNull().references(() => users.id),
  categoryId: uuid('category_id').references(() => categories.id),
  published: boolean('published').default(false),
  publishedAt: timestamp('published_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Comment model
export const comments = pgTable('comments', {
  id: uuid('id').defaultRandom().primaryKey(),
  content: text('content').notNull(),
  postId: uuid('post_id').notNull().references(() => posts.id, { onDelete: 'cascade' }),
  authorId: uuid('author_id').notNull().references(() => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
```

## Authentication

```typescript
@Controller('/auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('/register')
  @UseValidation(RegisterValidator)
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('/login')
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }
}
```

## Posts CRUD

```typescript
@Controller('/posts')
export class PostsController {
  constructor(private postsService: PostsService) {}

  @Get('/')
  async index(@Query() query: PaginationDto) {
    return this.postsService.findAll(query);
  }

  @Get('/:slug')
  async show(@Param('slug') slug: string) {
    return this.postsService.findBySlug(slug);
  }

  @Post('/')
  @UseGuards(AuthGuard)
  @UseValidation(CreatePostValidator)
  async create(@Body() dto: CreatePostDto, @CurrentUser() user: User) {
    return this.postsService.create(dto, user.id);
  }

  @Put('/:id')
  @UseGuards(AuthGuard, OwnershipGuard)
  async update(
    @Param('id') id: string,
    @Body() dto: UpdatePostDto
  ) {
    return this.postsService.update(id, dto);
  }

  @Delete('/:id')
  @UseGuards(AuthGuard, OwnershipGuard)
  async destroy(@Param('id') id: string) {
    return this.postsService.delete(id);
  }

  @Post('/:id/publish')
  @UseGuards(AuthGuard, OwnershipGuard)
  async publish(@Param('id') id: string) {
    return this.postsService.publish(id);
  }
}
```

## Comments

```typescript
@Controller('/posts/:postId/comments')
export class CommentsController {
  constructor(private commentsService: CommentsService) {}

  @Get('/')
  async index(@Param('postId') postId: string) {
    return this.commentsService.findByPost(postId);
  }

  @Post('/')
  @UseGuards(AuthGuard)
  @UseValidation(CreateCommentValidator)
  async create(
    @Param('postId') postId: string,
    @Body() dto: CreateCommentDto,
    @CurrentUser() user: User
  ) {
    return this.commentsService.create(postId, dto, user.id);
  }

  @Delete('/:id')
  @UseGuards(AuthGuard)
  async destroy(
    @Param('id') id: string,
    @CurrentUser() user: User
  ) {
    return this.commentsService.delete(id, user.id);
  }
}
```

## Running the Example

```bash
# Clone repository
git clone https://github.com/nyalajs/examples
cd examples/blog-api

# Install dependencies
npm install

# Setup database
cp .env.example .env
# Edit .env with your database credentials

# Run migrations
npm run db:migrate

# Seed database
npm run db:seed

# Start server
npm run dev
```

## API Endpoints

### Authentication
- `POST /auth/register` - Register new user
- `POST /auth/login` - Login user
- `POST /auth/refresh` - Refresh access token

### Posts
- `GET /posts` - List all posts
- `GET /posts/:slug` - Get single post
- `POST /posts` - Create post (auth required)
- `PUT /posts/:id` - Update post (auth + owner)
- `DELETE /posts/:id` - Delete post (auth + owner)
- `POST /posts/:id/publish` - Publish post (auth + owner)

### Comments
- `GET /posts/:postId/comments` - List comments
- `POST /posts/:postId/comments` - Create comment (auth)
- `DELETE /comments/:id` - Delete comment (auth + owner)

## Try It Out

```bash
# Register
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"password123","name":"John Doe"}'

# Login
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"password123"}'

# Create post (use token from login)
curl -X POST http://localhost:3000/posts \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"My First Post","content":"Hello World!","categoryId":"..."}'
```

## Source Code

Full source code: [github.com/nyalajs/examples/blog-api](https://github.com/nyalajs/examples/tree/main/blog-api)

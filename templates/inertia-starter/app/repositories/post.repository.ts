import { Injectable } from "@nyalajs/core";
import { desc, eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { BaseRepository } from "./base.repository";
import { posts, Post, NewPost } from "../models/post.model";
import { db } from "../../database/connection";

/**
 * Post Repository
 *
 * Backs the starter's one full CRUD resource — app/controllers/posts.controller.ts.
 */
@Injectable()
export class PostRepository extends BaseRepository<Post> {
    constructor() {
        super(posts);
    }

    /** Newest first — the natural order for a blog-style index page. */
    async findAllOrdered(): Promise<Post[]> {
        return db.select().from(posts).orderBy(desc(posts.createdAt));
    }

    async findByAuthor(authorId: string): Promise<Post[]> {
        return db.select().from(posts).where(eq(posts.authorId, authorId)).orderBy(desc(posts.createdAt));
    }

    /** Same id/timestamp-filling reasoning as UserRepository.createUser(). */
    async createPost(data: Omit<NewPost, "id" | "createdAt" | "updatedAt">): Promise<Post> {
        const now = new Date();
        const [row] = await db
            .insert(posts)
            .values({ ...data, id: randomUUID(), createdAt: now, updatedAt: now })
            .returning();
        return row;
    }
}

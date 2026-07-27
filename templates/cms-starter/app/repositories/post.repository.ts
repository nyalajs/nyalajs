import { Injectable } from "@nyalajs/core";
import { eq, and, desc } from "drizzle-orm";
import { BaseRepository } from "./base.repository";
import { posts, Post } from "../models/post.model";
import { db } from "../../database/connection";

@Injectable()
export class PostRepository extends BaseRepository<Post> {
    constructor() {
        super(posts);
    }

    async findBySlug(slug: string): Promise<Post | null> {
        return this.findOne(eq(posts.slug, slug));
    }

    async findPublishedBySlug(slug: string): Promise<Post | null> {
        return this.findOne(and(eq(posts.slug, slug), eq(posts.status, "published"))!);
    }

    async listPublished(options: { page?: number; limit?: number; categoryId?: string } = {}): Promise<{
        posts: Post[];
        total: number;
    }> {
        const limit = options.limit ?? 10;
        const page = options.page ?? 1;
        const offset = (page - 1) * limit;

        const where = options.categoryId
            ? and(eq(posts.status, "published"), eq(posts.categoryId, options.categoryId))!
            : eq(posts.status, "published");

        const rows = await db
            .select()
            .from(posts)
            .where(where)
            .orderBy(desc(posts.publishedAt))
            .limit(limit)
            .offset(offset);

        const total = await this.count(where);

        return { posts: rows, total };
    }

    async findByCategory(categoryId: string, limit = 3, excludeId?: string): Promise<Post[]> {
        const where = and(eq(posts.categoryId, categoryId), eq(posts.status, "published"))!;
        const rows = await this.findAll({ where, limit: excludeId ? limit + 1 : limit });
        return (excludeId ? rows.filter((p) => p.id !== excludeId) : rows).slice(0, limit);
    }
}

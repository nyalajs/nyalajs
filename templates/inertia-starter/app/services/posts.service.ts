import { Injectable } from "@nyalajs/core";
import { Logger } from "@nyalajs/observability";
import { PostRepository } from "../repositories/post.repository";
import { Post } from "../models/post.model";

/**
 * Posts Service
 *
 * The starter's one full CRUD resource. Any logged-in user can manage any
 * post (a simple shared-blog demo, not a per-user ownership model) — kept
 * intentionally simple so the example stays about the Inertia round trip
 * (props, flash, errors) rather than authorization rules.
 */
@Injectable()
export class PostsService {
    constructor(
        private readonly postRepository: PostRepository,
        private readonly logger: Logger
    ) {}

    async findAll(): Promise<Post[]> {
        return this.postRepository.findAllOrdered();
    }

    async findOne(id: string): Promise<Post | null> {
        return this.postRepository.findById(id);
    }

    async create(authorId: string, data: { title: string; body: string; published?: boolean }): Promise<Post> {
        const post = await this.postRepository.createPost({
            title: data.title,
            body: data.body,
            published: data.published ?? false,
            authorId,
        });
        this.logger.info("Post created", { postId: post.id, authorId });
        return post;
    }

    async update(id: string, data: { title: string; body: string; published?: boolean }): Promise<Post | null> {
        const updated = await this.postRepository.update(id, data);
        if (updated) {
            this.logger.info("Post updated", { postId: id });
        }
        return updated;
    }

    async delete(id: string): Promise<boolean> {
        const deleted = await this.postRepository.delete(id);
        if (deleted) {
            this.logger.info("Post deleted", { postId: id });
        }
        return deleted;
    }
}

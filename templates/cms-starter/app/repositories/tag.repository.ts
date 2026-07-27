import { Injectable } from "@nyalajs/core";
import { eq } from "drizzle-orm";
import { BaseRepository } from "./base.repository";
import { tags, Tag } from "../models/tag.model";

@Injectable()
export class TagRepository extends BaseRepository<Tag> {
    constructor() {
        super(tags);
    }

    async findBySlug(slug: string): Promise<Tag | null> {
        return this.findOne(eq(tags.slug, slug));
    }
}

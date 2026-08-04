import { Injectable } from "@nyalajs/core";
import { eq, and } from "drizzle-orm";
import { BaseRepository } from "./base.repository";
import { pages, Page } from "../models/page.model";

@Injectable()
export class PageRepository extends BaseRepository<Page> {
    constructor() {
        super(pages);
    }

    async findBySlug(slug: string): Promise<Page | null> {
        return this.findOne(eq(pages.slug, slug));
    }

    async findPublishedBySlug(slug: string): Promise<Page | null> {
        return this.findOne(and(eq(pages.slug, slug), eq(pages.status, "published"))!);
    }
}

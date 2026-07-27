import { Injectable } from "@nyalajs/core";
import { eq } from "drizzle-orm";
import { BaseRepository } from "./base.repository";
import { categories, Category } from "../models/category.model";

@Injectable()
export class CategoryRepository extends BaseRepository<Category> {
    constructor() {
        super(categories);
    }

    async findBySlug(slug: string): Promise<Category | null> {
        return this.findOne(eq(categories.slug, slug));
    }
}

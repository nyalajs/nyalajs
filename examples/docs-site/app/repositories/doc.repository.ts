import { Injectable } from "@nyalajs/core";
import { asc, eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { BaseRepository } from "./base.repository";
import { docs, Doc, NewDoc } from "../models/doc.model";
import { db } from "../../database/connection";

@Injectable()
export class DocRepository extends BaseRepository<Doc> {
    constructor() {
        super(docs);
    }

    /** The real lookup path — every /docs/:slug request resolves through this. */
    async findBySlug(slug: string): Promise<Doc | null> {
        return this.findOne(eq(docs.slug, slug));
    }

    async slugExists(slug: string, excludeId?: string): Promise<boolean> {
        const row = await this.findBySlug(slug);
        if (!row) return false;
        return row.id !== excludeId;
    }

    /** Grouped-sidebar order: group first (insertion order via MIN(sortOrder) would need a join; plain groupTitle+sortOrder is enough at this content size), then position within group. */
    async findAllOrdered(): Promise<Doc[]> {
        return db.select().from(docs).orderBy(asc(docs.groupTitle), asc(docs.sortOrder), asc(docs.title));
    }

    /**
     * Same id/timestamp-filling reasoning as inertia-starter's
     * PostRepository.createPost(), adjusted for MySQL: no RETURNING
     * clause, so the id is generated up front and the row is re-fetched
     * by it afterward (see BaseRepository.create()'s doc comment).
     */
    async createDoc(data: Omit<NewDoc, "id" | "createdAt" | "updatedAt">): Promise<Doc> {
        const now = new Date();
        const id = randomUUID();
        await db.insert(docs).values({ ...data, id, createdAt: now, updatedAt: now });
        return (await this.findById(id))!;
    }
}

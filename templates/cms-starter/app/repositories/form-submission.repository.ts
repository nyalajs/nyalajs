import { Injectable } from "@nyalajs/core";
import { eq, desc } from "drizzle-orm";
import { BaseRepository } from "./base.repository";
import { formSubmissions, FormSubmission } from "../models/form-submission.model";
import { db } from "../../database/connection";

@Injectable()
export class FormSubmissionRepository extends BaseRepository<FormSubmission> {
    constructor() {
        super(formSubmissions);
    }

    async listRecent(limit = 20): Promise<FormSubmission[]> {
        return db.select().from(formSubmissions).orderBy(desc(formSubmissions.createdAt)).limit(limit);
    }

    async markRead(id: string): Promise<FormSubmission | null> {
        return this.update(id, { read: true } as Partial<FormSubmission>);
    }

    async unreadCount(): Promise<number> {
        return this.count(eq(formSubmissions.read, false));
    }
}

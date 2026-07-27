import { pgTable, uuid, varchar, jsonb, boolean, timestamp } from "drizzle-orm/pg-core";
import { InferSelectModel, InferInsertModel } from "drizzle-orm";

export const formSubmissions = pgTable("form_submissions", {
    id: uuid("id").primaryKey().defaultRandom(),
    formName: varchar("form_name", { length: 100 }).notNull(),
    data: jsonb("data").notNull(),
    ip: varchar("ip", { length: 64 }),
    userAgent: varchar("user_agent", { length: 512 }),
    read: boolean("read").notNull().default(false),
    createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type FormSubmission = InferSelectModel<typeof formSubmissions>;
export type NewFormSubmission = InferInsertModel<typeof formSubmissions>;

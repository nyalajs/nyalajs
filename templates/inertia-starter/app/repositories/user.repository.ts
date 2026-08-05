import { Injectable } from "@nyalajs/core";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { BaseRepository } from "./base.repository";
import { users, User, NewUser } from "../models/user.model";
import { db } from "../../database/connection";

/**
 * User Repository
 *
 * Handles all database operations related to users.
 */
@Injectable()
export class UserRepository extends BaseRepository<User> {
    constructor() {
        super(users);
    }

    /**
     * Create a user with a generated id + timestamps — SQLite has no
     * `.defaultRandom()`/`.defaultNow()` equivalent wired up on these
     * columns (see user.model.ts), so the repository fills them in.
     */
    async createUser(data: Omit<NewUser, "id" | "createdAt" | "updatedAt">): Promise<User> {
        const now = new Date();
        const [row] = await db
            .insert(users)
            .values({ ...data, id: randomUUID(), createdAt: now, updatedAt: now })
            .returning();
        return row;
    }

    /**
     * Find user by email
     */
    async findByEmail(email: string): Promise<User | null> {
        return this.findOne(eq(users.email, email));
    }

    /**
     * Check if email exists
     */
    async emailExists(email: string): Promise<boolean> {
        const user = await this.findByEmail(email);
        return user !== null;
    }
}

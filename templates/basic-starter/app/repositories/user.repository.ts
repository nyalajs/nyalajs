import { Injectable } from "@nyala/core";
import { eq } from "drizzle-orm";
import { BaseRepository } from "./base.repository";
import { users, User } from "../models/user.model";

/**
 * User Repository
 *
 * Handles all database operations related to users.
 * Extends BaseRepository for common CRUD operations.
 */
@Injectable()
export class UserRepository extends BaseRepository<User> {
    constructor() {
        super(users);
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

    /**
     * Find active users
     */
    async findActive(options?: { limit?: number; offset?: number }): Promise<User[]> {
        return this.findAll({
            ...options,
            where: eq(users.isActive, true),
        });
    }

    /**
     * Update user's last login timestamp
     */
    async updateLastLogin(id: string): Promise<void> {
        await this.update(id, {
            updatedAt: new Date(),
        } as Partial<User>);
    }

    /**
     * Deactivate user
     */
    async deactivate(id: string): Promise<User | null> {
        return this.update(id, {
            isActive: false,
        } as Partial<User>);
    }

    /**
     * Activate user
     */
    async activate(id: string): Promise<User | null> {
        return this.update(id, {
            isActive: true,
        } as Partial<User>);
    }
}

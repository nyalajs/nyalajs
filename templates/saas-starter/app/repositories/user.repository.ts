import { Injectable } from "@nyala/core";
import { eq, and } from "drizzle-orm";
import { BaseRepository } from "./base.repository";
import { users, User } from "../models/user.model";

/**
 * User Repository (Tenant-Aware)
 *
 * All queries are automatically scoped to the current tenant.
 * Prevents cross-tenant data access.
 */
@Injectable()
export class UserRepository extends BaseRepository<User> {
    constructor() {
        super(users, true); // Tenant-aware
    }

    /**
     * Find user by email (within current tenant)
     */
    async findByEmail(email: string): Promise<User | null> {
        return this.findOne(eq(users.email, email));
    }

    /**
     * Find active users in current tenant
     */
    async findActive(options?: { limit?: number; offset?: number }): Promise<User[]> {
        return this.findAll({
            ...options,
            where: eq(users.isActive, true),
        });
    }

    /**
     * Update user's last login
     */
    async updateLastLogin(id: string): Promise<void> {
        await this.update(id, {
            updatedAt: new Date(),
        } as Partial<User>);
    }

    /**
     * Check if email exists in current tenant
     */
    async emailExists(email: string): Promise<boolean> {
        const user = await this.findByEmail(email);
        return user !== null;
    }

    /**
     * Find users by role in current tenant
     */
    async findByRole(role: string): Promise<User[]> {
        return this.findAll({
            where: eq(users.role, role),
        });
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

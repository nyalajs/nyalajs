import { db } from "../connection";
import { users } from "../../app/models/user.model";
import { hashPassword } from "../../app/helpers/password.helper";

/**
 * User Seeder
 *
 * Seeds the database with sample users for testing.
 */

export async function run() {
    console.log("Seeding users...");

    const sampleUsers = [
        {
            name: "Admin User",
            email: "admin@example.com",
            password: await hashPassword("Password123"),
            isActive: true,
            emailVerifiedAt: new Date(),
        },
        {
            name: "John Doe",
            email: "john@example.com",
            password: await hashPassword("Password123"),
            isActive: true,
            emailVerifiedAt: new Date(),
        },
        {
            name: "Jane Smith",
            email: "jane@example.com",
            password: await hashPassword("Password123"),
            isActive: true,
        },
    ];

    for (const user of sampleUsers) {
        await db.insert(users).values(user).onConflictDoNothing();
    }

    console.log(`✓ Seeded ${sampleUsers.length} users`);
}

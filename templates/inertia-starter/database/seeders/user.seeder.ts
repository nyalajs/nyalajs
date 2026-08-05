import { randomUUID } from "crypto";
import { db } from "../connection";
import { users } from "../../app/models/user.model";
import { hashPassword } from "../../app/helpers/password.helper";

/** Seeds a couple of sample users for local development/testing. */
export async function run() {
    console.log("Seeding users...");

    const now = new Date();
    const sampleUsers = [
        {
            id: randomUUID(),
            name: "Admin User",
            email: "admin@example.com",
            password: await hashPassword("Password123"),
            isActive: true,
            emailVerifiedAt: now,
            createdAt: now,
            updatedAt: now,
        },
        {
            id: randomUUID(),
            name: "Jane Doe",
            email: "jane@example.com",
            password: await hashPassword("Password123"),
            isActive: true,
            emailVerifiedAt: null,
            createdAt: now,
            updatedAt: now,
        },
    ];

    for (const user of sampleUsers) {
        await db.insert(users).values(user).onConflictDoNothing();
    }

    console.log(`✓ Seeded ${sampleUsers.length} users`);
}

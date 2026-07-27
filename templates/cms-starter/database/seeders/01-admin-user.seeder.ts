import { db } from "../connection";
import { users } from "../../app/models/user.model";
import { hashPassword } from "../../app/helpers/password.helper";

export async function run() {
    console.log("Seeding admin user...");

    await db
        .insert(users)
        .values({
            name: "Admin",
            email: "admin@example.com",
            password: await hashPassword("Password123"),
            role: "admin",
        })
        .onConflictDoNothing();

    console.log("✓ Seeded admin user (admin@example.com / Password123)");
}

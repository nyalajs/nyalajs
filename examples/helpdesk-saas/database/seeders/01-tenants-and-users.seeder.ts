import { eq } from "drizzle-orm";
import { db } from "../connection";
import { tenants } from "../../app/models/tenant.model";
import { users } from "../../app/models/user.model";
import { hashPassword } from "../../app/helpers/password.helper";

/**
 * Tenants + Users Seeder
 *
 * Seeds two separate tenants ("Acme Corp" and "Globex Inc") each with their
 * own users, so the tickets seeder (02-tickets.seeder.ts) can demonstrate
 * tenant isolation across two genuinely different tenants.
 */

export async function run() {
    console.log("Seeding tenants and users...");

    const [acme] = await db
        .insert(tenants)
        .values({
            name: "Acme Corp",
            slug: "acme",
            plan: "pro",
        })
        .onConflictDoNothing()
        .returning();

    const [globex] = await db
        .insert(tenants)
        .values({
            name: "Globex Inc",
            slug: "globex",
            plan: "starter",
        })
        .onConflictDoNothing()
        .returning();

    const acmeTenant = acme ?? (await db.select().from(tenants).where(eq(tenants.slug, "acme")).limit(1))[0];
    const globexTenant = globex ?? (await db.select().from(tenants).where(eq(tenants.slug, "globex")).limit(1))[0];

    const password = await hashPassword("Password123");

    await db
        .insert(users)
        .values([
            {
                tenantId: acmeTenant.id,
                name: "Alice Admin",
                email: "alice@acme.test",
                password,
                role: "admin",
                isActive: true,
                emailVerifiedAt: new Date(),
            },
            {
                tenantId: acmeTenant.id,
                name: "Andy Agent",
                email: "andy@acme.test",
                password,
                role: "user",
                isActive: true,
                emailVerifiedAt: new Date(),
            },
        ])
        .onConflictDoNothing();

    await db
        .insert(users)
        .values([
            {
                tenantId: globexTenant.id,
                name: "Grace Admin",
                email: "grace@globex.test",
                password,
                role: "admin",
                isActive: true,
                emailVerifiedAt: new Date(),
            },
            {
                tenantId: globexTenant.id,
                name: "Gary Agent",
                email: "gary@globex.test",
                password,
                role: "user",
                isActive: true,
                emailVerifiedAt: new Date(),
            },
        ])
        .onConflictDoNothing();

    console.log("✓ Seeded 2 tenants (acme, globex) and 4 users");
}

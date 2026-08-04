import { eq } from "drizzle-orm";
import { db } from "../connection";
import { tenants } from "../../app/models/tenant.model";
import { users } from "../../app/models/user.model";
import { tickets } from "../../app/models/ticket.model";
import { ticketComments } from "../../app/models/ticket-comment.model";

/**
 * Tickets Seeder
 *
 * Seeds realistic sample tickets (and a comment thread) for both the "acme"
 * and "globex" tenants created by 01-tenants-and-users.seeder.ts. Having
 * tickets under two distinct tenants makes it trivial to demonstrate tenant
 * isolation manually — see README.md's curl walkthrough.
 */

export async function run() {
    console.log("Seeding tickets...");

    const acmeTenant = (await db.select().from(tenants).where(eq(tenants.slug, "acme")).limit(1))[0];
    const globexTenant = (await db.select().from(tenants).where(eq(tenants.slug, "globex")).limit(1))[0];

    if (!acmeTenant || !globexTenant) {
        console.log("  Skipped: run 01-tenants-and-users.seeder.ts first.");
        return;
    }

    const acmeUsers = await db.select().from(users).where(eq(users.tenantId, acmeTenant.id));
    const globexUsers = await db.select().from(users).where(eq(users.tenantId, globexTenant.id));

    const acmeAdmin = acmeUsers.find((u) => u.role === "admin") ?? acmeUsers[0];
    const acmeAgent = acmeUsers.find((u) => u.role === "user") ?? acmeUsers[0];
    const globexAdmin = globexUsers.find((u) => u.role === "admin") ?? globexUsers[0];
    const globexAgent = globexUsers.find((u) => u.role === "user") ?? globexUsers[0];

    const acmeTickets = await db
        .insert(tickets)
        .values([
            {
                tenantId: acmeTenant.id,
                subject: "Cannot log into dashboard",
                description: "Getting a 500 error every time I try to log in since this morning.",
                status: "open",
                priority: "high",
                createdById: acmeAdmin.id,
                assignedToId: acmeAgent.id,
            },
            {
                tenantId: acmeTenant.id,
                subject: "Invoice PDF missing line items",
                description: "The downloaded invoice PDF is missing the itemized charges section.",
                status: "in_progress",
                priority: "medium",
                createdById: acmeAgent.id,
                assignedToId: acmeAgent.id,
            },
            {
                tenantId: acmeTenant.id,
                subject: "Feature request: dark mode",
                description: "Several users have asked for a dark mode option in settings.",
                status: "open",
                priority: "low",
                createdById: acmeAdmin.id,
                assignedToId: null,
            },
        ])
        .returning();

    const globexTickets = await db
        .insert(tickets)
        .values([
            {
                tenantId: globexTenant.id,
                subject: "API rate limit too low",
                description: "We're hitting the rate limit during normal business hours, please raise it.",
                status: "open",
                priority: "urgent",
                createdById: globexAdmin.id,
                assignedToId: globexAgent.id,
            },
            {
                tenantId: globexTenant.id,
                subject: "Billing address update",
                description: "Need to change our billing address on file for tax purposes.",
                status: "resolved",
                priority: "low",
                createdById: globexAgent.id,
                assignedToId: globexAgent.id,
            },
        ])
        .returning();

    // A short comment thread on the first Acme ticket.
    if (acmeTickets[0]) {
        await db.insert(ticketComments).values([
            {
                tenantId: acmeTenant.id,
                ticketId: acmeTickets[0].id,
                authorId: acmeAgent.id,
                body: "Looking into this now — can you share the exact error message?",
            },
            {
                tenantId: acmeTenant.id,
                ticketId: acmeTickets[0].id,
                authorId: acmeAdmin.id,
                body: "It says 'Internal Server Error' with no further detail.",
            },
        ]);
    }

    console.log(
        `✓ Seeded ${acmeTickets.length} tickets for acme, ${globexTickets.length} tickets for globex, plus a comment thread`,
    );
}

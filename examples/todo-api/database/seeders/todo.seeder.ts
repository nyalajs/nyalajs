import { eq } from "drizzle-orm";
import { db } from "../connection";
import { users } from "../../app/models/user.model";
import { todos } from "../../app/models/todo.model";

/**
 * Todo Seeder
 *
 * Seeds the database with sample todos for the users created by UserSeeder.
 * Run UserSeeder first so admin@example.com / john@example.com / jane@example.com exist.
 */

export async function run() {
    console.log("Seeding todos...");

    const [admin] = await db.select().from(users).where(eq(users.email, "admin@example.com")).limit(1);
    const [john] = await db.select().from(users).where(eq(users.email, "john@example.com")).limit(1);
    const [jane] = await db.select().from(users).where(eq(users.email, "jane@example.com")).limit(1);

    if (!admin || !john || !jane) {
        console.log("✗ Skipped seeding todos: run the user seeder first");
        return;
    }

    const sampleTodos = [
        {
            userId: admin.id,
            title: "Review pull requests",
            description: "Go through the open PRs on the todo-api example",
            completed: false,
            dueDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
        },
        {
            userId: admin.id,
            title: "Deploy staging environment",
            description: "Push the latest build to the staging server",
            completed: true,
        },
        {
            userId: john.id,
            title: "Write project proposal",
            description: "Draft the Q3 project proposal for the new client",
            completed: false,
            dueDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
        },
        {
            userId: john.id,
            title: "Buy groceries",
            completed: false,
        },
        {
            userId: jane.id,
            title: "Prepare presentation slides",
            description: "Slides for Monday's team sync",
            completed: false,
            dueDate: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000),
        },
        {
            userId: jane.id,
            title: "Renew gym membership",
            completed: true,
        },
    ];

    await db.insert(todos).values(sampleTodos);

    console.log(`✓ Seeded ${sampleTodos.length} todos`);
}

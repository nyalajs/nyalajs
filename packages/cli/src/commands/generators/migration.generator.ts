export function getMigrationTemplate(name: string): string {
    return `import { sql } from "drizzle-orm";

export async function up(db: any): Promise<void> {
  // TODO: implement migration for ${name}
  // await db.execute(sql\`CREATE TABLE ...\`);
}

export async function down(db: any): Promise<void> {
  // TODO: reverse migration for ${name}
}
`;
}

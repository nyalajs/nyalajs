export function getRepositoryTemplate(className: string): string {
    return `import { Injectable } from "@nyalajs/core";
import { DatabaseService } from "@nyalajs/database";

@Injectable()
export class ${className} {
  constructor(private readonly dbService: DatabaseService) {}

  async findAll() {
    // const db = this.dbService.getDb();
    // return await db.select().from(tableName);
  }

  async findById(id: string | number) {
    // ...
  }
}
`;
}

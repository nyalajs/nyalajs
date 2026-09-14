import { toKebabCase } from "../../utils/naming";

export function getModelTemplate(className: string): string {
    return `import { Model, Table, Primary, StringColumn, TimestampColumn } from "@nyalajs/database";

@Table("${toKebabCase(className)}s")
export class ${className} extends Model {
  @Primary()
  @StringColumn()
  id!: string;

  @TimestampColumn()
  createdAt!: Date;

  @TimestampColumn()
  updatedAt!: Date;
}
`;
}

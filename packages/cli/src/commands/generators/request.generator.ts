export function getRequestTemplate(className: string): string {
    return `import { z } from "zod";
import { ApiProperty } from "@nyalajs/http";

export const ${className}Schema = z.object({
  // TODO: Define validation rules
  // email: z.string().email(),
});

export class ${className} {
  // @ApiProperty({ description: "Example property", type: "string" })
  // public propertyName!: string;
}
`;
}

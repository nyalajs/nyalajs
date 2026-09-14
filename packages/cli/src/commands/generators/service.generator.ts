export function getServiceTemplate(className: string): string {
    return `import { Injectable } from "@nyalajs/core";

@Injectable()
export class ${className} {
  // Add your business logic here
}
`;
}

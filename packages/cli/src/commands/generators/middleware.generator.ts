export function getMiddlewareTemplate(className: string, name: string): string {
    return `import { Injectable } from "@nyalajs/core";
import { ExecutionContext } from "@nyalajs/http";

@Injectable()
export class ${className} {
  async use(ctx: ExecutionContext, next: () => Promise<void>): Promise<void> {
    // TODO: implement ${name} middleware logic
    await next();
  }
}
`;
}

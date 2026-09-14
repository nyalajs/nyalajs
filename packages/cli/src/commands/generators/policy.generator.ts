export function getPolicyTemplate(className: string, name: string): string {
    return `import { Injectable } from "@nyalajs/core";
import { Guard, ExecutionContext, ForbiddenException } from "@nyalajs/http";

@Injectable()
export class ${className} implements Guard {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const user = context.context.metadata.get("user");

    if (!user) {
      throw new ForbiddenException("Not authorized");
    }

    // TODO: implement the authorization rule for ${name}
    return true;
  }
}
`;
}

export function getControllerTemplate(className: string, fileName: string): string {
    return `import { Controller, Get, Post } from "@nyalajs/core";

@Controller("/${fileName}")
export class ${className} {
  @Get("/")
  findAll() {
    return { message: "This action returns all ${fileName}" };
  }

  @Post("/")
  create() {
    return { message: "This action creates a new ${fileName}" };
  }
}
`;
}

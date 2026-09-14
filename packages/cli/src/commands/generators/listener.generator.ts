export function getListenerTemplate(className: string): string {
    return `import { Injectable } from "@nyalajs/core";
import { EventHandler } from "@nyalajs/events";

@Injectable()
export class ${className} {
  @EventHandler("example.event")
  async handle(event: unknown): Promise<void> {
    // TODO: react to the event
  }
}
`;
}

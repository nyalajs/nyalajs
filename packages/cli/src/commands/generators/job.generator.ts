export function getJobTemplate(className: string, name: string): string {
    return `import { Process } from "@nyalajs/queue";
import type { Job } from "bullmq";

export class ${className} {
  /**
   * Handle the queued job.
   * Dispatch with: dispatch("${name}", "${className}", { ...payload })
   */
  @Process("${name}")
  async handle(job: Job): Promise<void> {
    const data = job.data;
    // TODO: implement background work for ${name}
    console.log("[${className}] Processing job", data);
  }
}
`;
}

import "reflect-metadata";

export const PROCESS_METADATA_KEY = "nyala:queue:process";

/**
 * Marks a class method as a job processor for the given queue name.
 *
 * @param queueName  Name of the BullMQ queue to consume from.
 *
 * @example
 * export class SendWelcomeEmailJob {
 *   @Process("mail")
 *   async handle(job: Job) { ... }
 * }
 */
export function Process(queueName: string): MethodDecorator {
    return (target: any, propertyKey: string | symbol) => {
        Reflect.defineMetadata(
            PROCESS_METADATA_KEY,
            queueName,
            target,
            propertyKey
        );
    };
}

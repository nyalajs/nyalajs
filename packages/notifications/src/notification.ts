import { Mailable } from "@nyala/mail";

/**
 * Base class for a Notification.
 *
 * @example
 * export class InvoicePaid extends Notification {
 *   constructor(private invoice: Invoice) { super(); }
 *
 *   via(): string[] { return ["mail", "database"]; }
 *
 *   toMail(): Mailable {
 *     return new InvoicePaidMail(this.invoice);
 *   }
 *
 *   toDatabase(): any {
 *     return { invoiceId: this.invoice.id, amount: this.invoice.amount };
 *   }
 * }
 */
export abstract class Notification {
    /**
     * Determine which channels this notification should be sent through.
     * Common channels: "mail", "database", "sms".
     */
    abstract via(notifiable: any): string[];

    /**
     * Get the mail representation of the notification.
     */
    toMail?(notifiable: any): Mailable;

    /**
     * Get the array/JSON representation of the notification.
     * This data will be serialized and stored in the database.
     */
    toDatabase?(notifiable: any): Record<string, any>;
    
    /**
     * Get the SMS representation of the notification.
     */
    toSms?(notifiable: any): string;
}

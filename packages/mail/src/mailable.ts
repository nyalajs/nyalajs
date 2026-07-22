export interface Envelope {
    /** Recipient address(es). */
    to: string | string[];
    /** Sender address. Falls back to MAIL_FROM env if omitted. */
    from?: string;
    /** Subject line. */
    subject: string;
    /** CC recipients. */
    cc?: string | string[];
    /** BCC recipients. */
    bcc?: string | string[];
}

/**
 * Abstract base class for all mailables.
 *
 * Extend this class to create typed, reusable mail objects:
 *
 * @example
 * export class WelcomeMail extends Mailable {
 *   constructor(private user: User) { super(); }
 *
 *   envelope(): Envelope {
 *     return { to: this.user.email, subject: "Welcome to Nyala!" };
 *   }
 *
 *   content(): string {
 *     return `<h1>Hello, ${this.user.name}!</h1>`;
 *   }
 * }
 *
 * // Dispatch from a controller or service:
 * await MailService.send(new WelcomeMail(user));
 */
export abstract class Mailable {
    /** Defines to/from/subject/cc/bcc. */
    abstract envelope(): Envelope;

    /**
     * Returns the HTML body of the email.
     * Override for text-only: return a plain string without HTML tags and set
     * `isHtml()` to return false.
     */
    abstract content(): string;

    /** Override to return false to send plain text instead of HTML. */
    isHtml(): boolean {
        return true;
    }
}

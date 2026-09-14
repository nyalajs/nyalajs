import { Mailable, Envelope } from "@nyalajs/mail";
import type { User } from "../models/user.model";

/** Sent on signup (and on-demand via POST /auth/resend-verification) with a link to confirm the account's email address. */
export class VerifyEmailMail extends Mailable {
    constructor(
        private readonly user: Pick<User, "email" | "name">,
        private readonly verificationUrl: string
    ) {
        super();
    }

    envelope(): Envelope {
        return { to: this.user.email, subject: "Verify your email address" };
    }

    content(): string {
        return `
            <h1>Welcome, ${this.escapeHtml(this.user.name)}!</h1>
            <p>Please confirm your email address to finish setting up your account.</p>
            <p><a href="${this.verificationUrl}">Verify my email</a></p>
            <p>This link expires in 24 hours. If you didn't create this account, you can safely ignore this email.</p>
        `.trim();
    }

    private escapeHtml(value: string): string {
        return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    }
}

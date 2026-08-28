import { Mailable, Envelope } from "@nyalajs/mail";

export class ResetPasswordMail extends Mailable {
    constructor(
        private readonly toEmail: string,
        private readonly resetUrl: string
    ) {
        super();
    }

    envelope(): Envelope {
        return { to: this.toEmail, subject: "Reset your password" };
    }

    content(): string {
        return `
            <h1>Reset your password</h1>
            <p>We received a request to reset your password. Click below to choose a new one:</p>
            <p><a href="${this.resetUrl}">Reset my password</a></p>
            <p>This link expires in 1 hour. If you didn't request this, you can safely ignore this email — your password won't be changed.</p>
        `.trim();
    }
}

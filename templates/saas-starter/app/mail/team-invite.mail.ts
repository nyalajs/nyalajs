import { Mailable, Envelope } from "@nyalajs/mail";

export class TeamInviteMail extends Mailable {
    constructor(
        private readonly toEmail: string,
        private readonly tenantName: string,
        private readonly inviterName: string,
        private readonly acceptUrl: string
    ) {
        super();
    }

    envelope(): Envelope {
        return { to: this.toEmail, subject: `${this.inviterName} invited you to join ${this.tenantName}` };
    }

    content(): string {
        return `
            <h1>You've been invited to ${this.escapeHtml(this.tenantName)}</h1>
            <p>${this.escapeHtml(this.inviterName)} has invited you to join their team.</p>
            <p><a href="${this.acceptUrl}">Accept invitation</a></p>
            <p>This invitation expires in 7 days.</p>
        `.trim();
    }

    private escapeHtml(value: string): string {
        return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    }
}

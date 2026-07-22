import { Injectable } from "@nyala/core";
import nodemailer, { Transporter, SendMailOptions } from "nodemailer";
import { Mailable } from "./mailable";

export interface MailConfig {
    host?: string;
    port?: number;
    secure?: boolean;
    user?: string;
    pass?: string;
    /** Default from address. Falls back to MAIL_FROM env var. */
    from?: string;
    /** If true, uses nodemailer's test account (Ethereal) — perfect for development. */
    preview?: boolean;
}

@Injectable()
export class MailService {
    private transporter!: Transporter;
    private defaultFrom: string = "no-reply@example.com";

    async connect(config: MailConfig = {}): Promise<void> {
        if (config.preview) {
            // Use Ethereal for development preview emails
            const testAccount = await nodemailer.createTestAccount();
            this.transporter = nodemailer.createTransport({
                host: "smtp.ethereal.email",
                port: 587,
                secure: false,
                auth: {
                    user: testAccount.user,
                    pass: testAccount.pass,
                },
            });
            console.log(
                `[nyala/mail] Preview mode enabled. Test inbox: ${testAccount.web}`
            );
        } else {
            this.transporter = nodemailer.createTransport({
                host: config.host ?? process.env.MAIL_HOST ?? "localhost",
                port: config.port ?? Number(process.env.MAIL_PORT ?? 587),
                secure: config.secure ?? false,
                auth:
                    config.user || process.env.MAIL_USER
                        ? {
                              user: config.user ?? process.env.MAIL_USER!,
                              pass: config.pass ?? process.env.MAIL_PASS!,
                          }
                        : undefined,
            });
        }

        this.defaultFrom =
            config.from ?? process.env.MAIL_FROM ?? "no-reply@example.com";
    }

    /**
     * Send a Mailable instance.
     *
     * @example
     * await mailService.send(new WelcomeMail(user));
     */
    async send(mailable: Mailable): Promise<void> {
        if (!this.transporter) {
            throw new Error(
                "[nyala/mail] MailService not connected. Call connect() during bootstrap."
            );
        }

        const envelope = mailable.envelope();
        const body = mailable.content();
        const html = mailable.isHtml();

        const options: SendMailOptions = {
            from: envelope.from ?? this.defaultFrom,
            to: Array.isArray(envelope.to) ? envelope.to.join(", ") : envelope.to,
            subject: envelope.subject,
            cc: envelope.cc,
            bcc: envelope.bcc,
            [html ? "html" : "text"]: body,
        };

        const info = await this.transporter.sendMail(options);

        // Log Ethereal preview URL if available
        const previewUrl = nodemailer.getTestMessageUrl(info);
        if (previewUrl) {
            console.log(`[nyala/mail] Preview: ${previewUrl}`);
        }
    }

    /**
     * Send a raw message without creating a Mailable.
     */
    async sendRaw(options: SendMailOptions): Promise<void> {
        if (!this.transporter) {
            throw new Error(
                "[nyala/mail] MailService not connected. Call connect() during bootstrap."
            );
        }
        await this.transporter.sendMail({
            from: options.from ?? this.defaultFrom,
            ...options,
        });
    }
}

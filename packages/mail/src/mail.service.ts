import { Injectable } from "@nyalajs/core";
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
    /** Milliseconds to wait for the initial TCP connection before giving up. Default 10000. */
    connectionTimeoutMs?: number;
    /** Milliseconds to wait for the SMTP greeting after connecting. Default 10000. */
    greetingTimeoutMs?: number;
    /** Milliseconds of socket inactivity before giving up mid-send. Default 20000. */
    socketTimeoutMs?: number;
}

@Injectable()
export class MailService {
    private transporter!: Transporter;
    private defaultFrom: string = "no-reply@example.com";

    async connect(config: MailConfig = {}): Promise<void> {
        // Without these, a slow/unresponsive SMTP server (the real provider
        // having an outage, or even the Ethereal test server in dev) leaves
        // transporter.sendMail() pending indefinitely — and since send() is
        // typically awaited from a user-facing request (e.g. signup sending
        // a verification email), that hangs the ENTIRE HTTP request with no
        // way for the caller to time out except closing the connection
        // itself. Reproduced against a real app: a registration request
        // never completed and the process had to be killed to recover.
        const timeouts = {
            connectionTimeout: config.connectionTimeoutMs ?? 10_000,
            greetingTimeout: config.greetingTimeoutMs ?? 10_000,
            socketTimeout: config.socketTimeoutMs ?? 20_000,
        };

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
                ...timeouts,
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
                ...timeouts,
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

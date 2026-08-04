import { describe, it, expect, vi } from "vitest";
import { MailService } from "../mail.service";
import { Mailable, Envelope } from "../mailable";

class TestMail extends Mailable {
    constructor(private readonly env: Envelope, private readonly body = "<p>hi</p>", private readonly html = true) {
        super();
    }
    envelope(): Envelope {
        return this.env;
    }
    content(): string {
        return this.body;
    }
    isHtml(): boolean {
        return this.html;
    }
}

function fakeTransporter() {
    return { sendMail: vi.fn().mockResolvedValue({ messageId: "abc" }) };
}

describe("MailService", () => {
    it("throws when send() is called before connect()", async () => {
        const service = new MailService();
        await expect(service.send(new TestMail({ to: "a@example.com", subject: "hi" }))).rejects.toThrow(
            /not connected/
        );
    });

    it("throws when sendRaw() is called before connect()", async () => {
        const service = new MailService();
        await expect(service.sendRaw({ to: "a@example.com", subject: "hi", text: "x" })).rejects.toThrow(
            /not connected/
        );
    });

    it("send() maps the Mailable's envelope onto SendMailOptions, using html body for an HTML mail", async () => {
        const service = new MailService();
        const transporter = fakeTransporter();
        (service as any).transporter = transporter;
        (service as any).defaultFrom = "no-reply@example.com";

        await service.send(new TestMail({ to: "user@example.com", subject: "Welcome" }, "<h1>Hi</h1>", true));

        expect(transporter.sendMail).toHaveBeenCalledWith(
            expect.objectContaining({
                from: "no-reply@example.com",
                to: "user@example.com",
                subject: "Welcome",
                html: "<h1>Hi</h1>",
            })
        );
        expect(transporter.sendMail.mock.calls[0][0]).not.toHaveProperty("text");
    });

    it("send() uses the text field for a plain-text mail", async () => {
        const service = new MailService();
        const transporter = fakeTransporter();
        (service as any).transporter = transporter;

        await service.send(new TestMail({ to: "user@example.com", subject: "Plain" }, "just text", false));

        expect(transporter.sendMail).toHaveBeenCalledWith(expect.objectContaining({ text: "just text" }));
    });

    it("send() prefers the envelope's own `from` over the default", async () => {
        const service = new MailService();
        const transporter = fakeTransporter();
        (service as any).transporter = transporter;
        (service as any).defaultFrom = "default@example.com";

        await service.send(new TestMail({ to: "a@example.com", subject: "s", from: "custom@example.com" }));

        expect(transporter.sendMail).toHaveBeenCalledWith(expect.objectContaining({ from: "custom@example.com" }));
    });

    it("send() joins multiple `to` recipients with a comma", async () => {
        const service = new MailService();
        const transporter = fakeTransporter();
        (service as any).transporter = transporter;

        await service.send(new TestMail({ to: ["a@example.com", "b@example.com"], subject: "s" }));

        expect(transporter.sendMail).toHaveBeenCalledWith(expect.objectContaining({ to: "a@example.com, b@example.com" }));
    });

    it("sendRaw() falls back to the default from address when none is given", async () => {
        const service = new MailService();
        const transporter = fakeTransporter();
        (service as any).transporter = transporter;
        (service as any).defaultFrom = "default@example.com";

        await service.sendRaw({ to: "a@example.com", subject: "s", text: "hi" });

        expect(transporter.sendMail).toHaveBeenCalledWith(expect.objectContaining({ from: "default@example.com" }));
    });

    describe("connect() (non-preview, no real network I/O — nodemailer builds the transporter lazily)", () => {
        it("sets the default from address from config", async () => {
            const service = new MailService();
            await service.connect({ host: "smtp.example.com", port: 587, from: "team@example.com" });

            expect((service as any).defaultFrom).toBe("team@example.com");
        });

        it("falls back to the built-in default from address", async () => {
            delete process.env.MAIL_FROM;
            const service = new MailService();
            await service.connect({});

            expect((service as any).defaultFrom).toBe("no-reply@example.com");
        });
    });
});

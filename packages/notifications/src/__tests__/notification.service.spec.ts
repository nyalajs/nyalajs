import { describe, it, expect, vi } from "vitest";
import { NotificationService, Notifiable } from "../notification.service";
import { Notification } from "../notification";
import { Mailable, Envelope } from "@nyalajs/mail";

class WelcomeMail extends Mailable {
    envelope(): Envelope {
        return { to: "", subject: "Welcome" }; // deliberately empty — NotificationService should fill it in
    }
    content(): string {
        return "<h1>Welcome</h1>";
    }
}

class WelcomeNotification extends Notification {
    constructor(private readonly channels: string[]) {
        super();
    }
    via(): string[] {
        return this.channels;
    }
    toMail(): Mailable {
        return new WelcomeMail();
    }
    toDatabase(): Record<string, any> {
        return { type: "welcome" };
    }
    toSms(): string {
        return "Welcome!";
    }
}

class IncompleteNotification extends Notification {
    via(): string[] {
        return ["mail"];
    }
    // no toMail() implementation
}

function fakeMailService() {
    return { send: vi.fn().mockResolvedValue(undefined) };
}

describe("NotificationService", () => {
    it("sends to the mail channel via the injected MailService", async () => {
        const service = new NotificationService();
        const mailService = fakeMailService();
        service.setMailService(mailService as any);

        const notifiable: Notifiable = { email: "user@example.com" };
        await service.send(notifiable, new WelcomeNotification(["mail"]));

        expect(mailService.send).toHaveBeenCalledOnce();
    });

    it("fills in the recipient's email when the Mailable's envelope doesn't set `to`", async () => {
        const service = new NotificationService();
        const mailService = fakeMailService();
        service.setMailService(mailService as any);

        await service.send({ email: "user@example.com" }, new WelcomeNotification(["mail"]));

        const sentMailable = mailService.send.mock.calls[0][0];
        expect(sentMailable.envelope().to).toBe("user@example.com");
    });

    it("throws (internally, caught per-channel) when mail channel is used with no MailService configured", async () => {
        const service = new NotificationService(); // no setMailService()
        const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

        await service.send({ email: "a@example.com" }, new WelcomeNotification(["mail"]));

        expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("mail"), expect.any(Error));
        errorSpy.mockRestore();
    });

    it("logs a simulated send for the database channel when no databaseModel is configured", async () => {
        const service = new NotificationService();
        const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

        await service.send({ id: "1" }, new WelcomeNotification(["database"]));

        expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("simulated"), { type: "welcome" });
        logSpy.mockRestore();
    });

    it("persists to the configured databaseModel for the database channel", async () => {
        const service = new NotificationService();
        const create = vi.fn().mockResolvedValue(undefined);
        service.connect({ databaseModel: { create } });

        await service.send({ id: "42" }, new WelcomeNotification(["database"]));

        expect(create).toHaveBeenCalledWith(
            expect.objectContaining({ notifiableId: "42", type: "WelcomeNotification", data: { type: "welcome" } })
        );
    });

    it("logs a simulated send for the sms channel", async () => {
        const service = new NotificationService();
        const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

        await service.send({ phone: "555-1234" }, new WelcomeNotification(["sms"]));

        expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("555-1234: Welcome!"));
        logSpy.mockRestore();
    });

    it("warns on an unknown channel instead of throwing", async () => {
        const service = new NotificationService();
        const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);

        await expect(service.send({}, new WelcomeNotification(["push"]))).resolves.not.toThrow();
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("push"));
        warnSpy.mockRestore();
    });

    it("continues to remaining channels when one channel fails", async () => {
        const service = new NotificationService();
        const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
        const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

        // mail fails (no MailService), sms should still run
        await service.send({ phone: "555-0000" }, new WelcomeNotification(["mail", "sms"]));

        expect(errorSpy).toHaveBeenCalled();
        expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("555-0000"));
        errorSpy.mockRestore();
        logSpy.mockRestore();
    });

    it("fails a channel gracefully when the notification is missing that channel's method", async () => {
        const service = new NotificationService();
        const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

        await expect(service.send({}, new IncompleteNotification())).resolves.not.toThrow();
        expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("mail"), expect.any(Error));
        errorSpy.mockRestore();
    });
});

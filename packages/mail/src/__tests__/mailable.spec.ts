import { describe, it, expect } from "vitest";
import { Mailable, Envelope } from "../mailable";

class WelcomeMail extends Mailable {
    constructor(private readonly to: string) {
        super();
    }

    envelope(): Envelope {
        return { to: this.to, subject: "Welcome!" };
    }

    content(): string {
        return "<h1>Welcome</h1>";
    }
}

class PlainTextMail extends Mailable {
    envelope(): Envelope {
        return { to: "a@example.com", subject: "Plain" };
    }

    content(): string {
        return "Just text.";
    }

    isHtml(): boolean {
        return false;
    }
}

describe("Mailable", () => {
    it("exposes the envelope and content a subclass defines", () => {
        const mail = new WelcomeMail("user@example.com");
        expect(mail.envelope()).toEqual({ to: "user@example.com", subject: "Welcome!" });
        expect(mail.content()).toBe("<h1>Welcome</h1>");
    });

    it("defaults isHtml() to true", () => {
        expect(new WelcomeMail("a@example.com").isHtml()).toBe(true);
    });

    it("allows a subclass to opt into plain text", () => {
        expect(new PlainTextMail().isHtml()).toBe(false);
    });
});

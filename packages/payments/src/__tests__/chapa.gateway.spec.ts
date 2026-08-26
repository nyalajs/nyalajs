import { describe, it, expect } from "vitest";
import crypto from "node:crypto";
import { ChapaGateway } from "../gateways/chapa/chapa.gateway";

// Real HMAC-SHA256 sign/verify round trip via chapa-nodejs's own
// verifyWebhookSignature() — no network calls, no real Chapa account needed
// for signature verification (pure local crypto).

const SECRET_KEY = "CHASECK_TEST-does-not-need-to-be-real-for-these-tests";
const WEBHOOK_SECRET = "chapa-webhook-secret-for-e2e-only";

function signPayload(payloadObject: unknown, secret: string): { rawBody: Buffer; signature: string } {
    const raw = JSON.stringify(payloadObject);
    const signature = crypto.createHmac("sha256", secret).update(raw).digest("hex");
    return { rawBody: Buffer.from(raw), signature };
}

describe("ChapaGateway (real HMAC-SHA256 sign/verify via chapa-nodejs, no network calls)", () => {
    it("verifies a genuinely-signed charge.success webhook and normalizes it, converting ETB major units to minor", async () => {
        const gateway = new ChapaGateway({ secretKey: SECRET_KEY, webhookSecret: WEBHOOK_SECRET });

        const { rawBody, signature } = signPayload(
            { event: "charge.success", tx_ref: "order-77", amount: "150.50", currency: "ETB" },
            WEBHOOK_SECRET
        );

        const event = await gateway.verifyWebhook(rawBody, { "chapa-signature": signature });

        expect(event).not.toBeNull();
        expect(event!.type).toBe("payment.succeeded");
        expect(event!.reference).toBe("order-77");
        expect(event!.amountMinor).toBe(15050); // 150.50 ETB -> 15050 minor units
        expect(event!.currency).toBe("ETB");
        expect(event!.gateway).toBe("chapa");
    });

    it("accepts the x-chapa-signature header as a fallback name", async () => {
        const gateway = new ChapaGateway({ secretKey: SECRET_KEY, webhookSecret: WEBHOOK_SECRET });
        const { rawBody, signature } = signPayload(
            { event: "charge.success", tx_ref: "order-78", amount: "10.00", currency: "ETB" },
            WEBHOOK_SECRET
        );
        const event = await gateway.verifyWebhook(rawBody, { "x-chapa-signature": signature });
        expect(event).not.toBeNull();
    });

    it("REJECTS a webhook signed with a different secret", async () => {
        const gateway = new ChapaGateway({ secretKey: SECRET_KEY, webhookSecret: WEBHOOK_SECRET });
        const { rawBody, signature } = signPayload(
            { event: "charge.success", tx_ref: "order-79", amount: "10.00", currency: "ETB" },
            "a-totally-different-secret"
        );
        const event = await gateway.verifyWebhook(rawBody, { "chapa-signature": signature });
        expect(event).toBeNull();
    });

    it("REJECTS a tampered payload (signature no longer matches the body)", async () => {
        const gateway = new ChapaGateway({ secretKey: SECRET_KEY, webhookSecret: WEBHOOK_SECRET });
        const { signature } = signPayload(
            { event: "charge.success", tx_ref: "order-80", amount: "10.00", currency: "ETB" },
            WEBHOOK_SECRET
        );
        const tamperedBody = Buffer.from(
            JSON.stringify({ event: "charge.success", tx_ref: "order-80", amount: "999999.00", currency: "ETB" })
        );
        const event = await gateway.verifyWebhook(tamperedBody, { "chapa-signature": signature });
        expect(event).toBeNull();
    });

    it("returns null for an unrecognized event type", async () => {
        const gateway = new ChapaGateway({ secretKey: SECRET_KEY, webhookSecret: WEBHOOK_SECRET });
        const { rawBody, signature } = signPayload({ event: "subaccount.created" }, WEBHOOK_SECRET);
        const event = await gateway.verifyWebhook(rawBody, { "chapa-signature": signature });
        expect(event).toBeNull();
    });

    it("throws when verifyWebhook() is called with no webhookSecret configured", async () => {
        const gateway = new ChapaGateway({ secretKey: SECRET_KEY });
        await expect(gateway.verifyWebhook(Buffer.from("{}"), {})).rejects.toThrow(/webhookSecret/);
    });

    it("throws when createCheckout() is given neither lineItems nor amountMinor", async () => {
        const gateway = new ChapaGateway({ secretKey: SECRET_KEY });
        await expect(
            gateway.createCheckout({
                reference: "order-81",
                currency: "ETB",
                successUrl: "https://example.com/ok",
                cancelUrl: "https://example.com/cancel",
            })
        ).rejects.toThrow(/lineItems or amountMinor/);
    });
});

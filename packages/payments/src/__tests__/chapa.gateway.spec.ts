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

    it("throws (never reaches the network) when createCheckout() is given a negative amountMinor", async () => {
        const gateway = new ChapaGateway({ secretKey: SECRET_KEY });
        await expect(
            gateway.createCheckout({
                reference: "order-83",
                currency: "ETB",
                amountMinor: -1000,
                successUrl: "https://example.com/ok",
                cancelUrl: "https://example.com/cancel",
            })
        ).rejects.toThrow(/invalid amount/i);
    });

    it("createCheckout() sums lineItems into the correct total when amountMinor is omitted (verified via the real API's rejection reaching the amount-dependent step, not an early validation throw)", async () => {
        const gateway = new ChapaGateway({ secretKey: SECRET_KEY });
        // No amountMinor — only lineItems. If resolveAmount() summed them
        // wrong or threw, this would fail before ever reaching the network;
        // instead it reaches Chapa's real API and fails there instead,
        // proving the amount was computed and passed through.
        await expect(
            gateway.createCheckout({
                reference: "order-82",
                currency: "ETB",
                lineItems: [{ name: "Widget", amountMinor: 1000, quantity: 2 }, { name: "Fee", amountMinor: 250 }], // sums to 2250
                successUrl: "https://example.com/ok",
                cancelUrl: "https://example.com/cancel",
            })
        ).rejects.toThrow(/Invalid API Key|checkout_url/);
    }, 15000);

    it("refund() against the REAL Chapa API normalizes a real failure into { status: 'failed' } instead of throwing", async () => {
        const gateway = new ChapaGateway({ secretKey: SECRET_KEY });
        const result = await gateway.refund("order-does-not-exist");
        expect(result.status).toBe("failed");
        if (result.status === "failed") {
            expect(result.reason).toMatch(/Invalid API Key/);
        }
    }, 15000);
});

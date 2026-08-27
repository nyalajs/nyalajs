import { describe, it, expect } from "vitest";
import Stripe from "stripe";
import { StripeGateway } from "../gateways/stripe/stripe.gateway";

// No real Stripe account needed for these — webhook verification is pure
// local HMAC-SHA256 crypto (Stripe's own generateTestHeaderString signs a
// payload exactly the way a real webhook would, so constructEventAsync
// verifying it is a genuine, unmocked crypto round trip), and the
// createCheckout validation logic never calls the network for its
// early-throw paths.

const FAKE_SECRET_KEY = "sk_test_does_not_need_to_be_real_for_these_tests";
const WEBHOOK_SECRET = "whsec_test_secret_for_e2e_only";

function signPayload(payloadObject: unknown, secret: string): { rawBody: Buffer; header: string } {
    const client = new Stripe(FAKE_SECRET_KEY);
    const payload = JSON.stringify(payloadObject);
    const header = client.webhooks.generateTestHeaderString({ payload, secret });
    return { rawBody: Buffer.from(payload), header };
}

describe("StripeGateway (real HMAC-SHA256 sign/verify, no network calls)", () => {
    it("verifies a genuinely-signed checkout.session.completed webhook and normalizes it", async () => {
        const gateway = new StripeGateway({ secretKey: FAKE_SECRET_KEY, webhookSecret: WEBHOOK_SECRET });

        const { rawBody, header } = signPayload(
            {
                id: "evt_1",
                type: "checkout.session.completed",
                data: {
                    object: {
                        id: "cs_test_1",
                        client_reference_id: "order-42",
                        amount_total: 2500,
                        currency: "usd",
                        metadata: { plan: "pro" },
                    },
                },
            },
            WEBHOOK_SECRET
        );

        const event = await gateway.verifyWebhook(rawBody, { "stripe-signature": header });

        expect(event).not.toBeNull();
        expect(event!.type).toBe("payment.succeeded");
        expect(event!.reference).toBe("order-42");
        expect(event!.gatewayReference).toBe("cs_test_1");
        expect(event!.amountMinor).toBe(2500);
        expect(event!.currency).toBe("USD");
        expect(event!.metadata).toEqual({ plan: "pro" });
        expect(event!.gateway).toBe("stripe");
    });

    it("REJECTS a webhook signed with a different secret — the actual fraud-prevention path", async () => {
        const gateway = new StripeGateway({ secretKey: FAKE_SECRET_KEY, webhookSecret: WEBHOOK_SECRET });

        const { rawBody, header } = signPayload(
            { id: "evt_2", type: "checkout.session.completed", data: { object: { id: "cs_2" } } },
            "whsec_a_totally_different_secret"
        );

        const event = await gateway.verifyWebhook(rawBody, { "stripe-signature": header });
        expect(event).toBeNull();
    });

    it("REJECTS a tampered payload (signature no longer matches the body)", async () => {
        const gateway = new StripeGateway({ secretKey: FAKE_SECRET_KEY, webhookSecret: WEBHOOK_SECRET });

        const { header } = signPayload(
            { id: "evt_3", type: "checkout.session.completed", data: { object: { id: "cs_3", amount_total: 100 } } },
            WEBHOOK_SECRET
        );
        // Attacker modifies the amount after the signature was computed.
        const tamperedBody = Buffer.from(
            JSON.stringify({ id: "evt_3", type: "checkout.session.completed", data: { object: { id: "cs_3", amount_total: 999999 } } })
        );

        const event = await gateway.verifyWebhook(tamperedBody, { "stripe-signature": header });
        expect(event).toBeNull();
    });

    it("returns null (not throw) for an unrecognized event type — caller ignores it", async () => {
        const gateway = new StripeGateway({ secretKey: FAKE_SECRET_KEY, webhookSecret: WEBHOOK_SECRET });

        const { rawBody, header } = signPayload(
            { id: "evt_4", type: "customer.created", data: { object: { id: "cus_1" } } },
            WEBHOOK_SECRET
        );

        const event = await gateway.verifyWebhook(rawBody, { "stripe-signature": header });
        expect(event).toBeNull();
    });

    it("throws when verifyWebhook() is called with no webhookSecret configured", async () => {
        const gateway = new StripeGateway({ secretKey: FAKE_SECRET_KEY });
        await expect(gateway.verifyWebhook(Buffer.from("{}"), {})).rejects.toThrow(/webhookSecret/);
    });

    it("createCheckout() throws when given neither lineItems nor amountMinor", async () => {
        const gateway = new StripeGateway({ secretKey: FAKE_SECRET_KEY });
        await expect(
            gateway.createCheckout({
                reference: "order-1",
                currency: "USD",
                successUrl: "https://example.com/ok",
                cancelUrl: "https://example.com/cancel",
            })
        ).rejects.toThrow(/lineItems or amountMinor/);
    });

    it("createCheckout() throws when lineItems and amountMinor disagree", async () => {
        const gateway = new StripeGateway({ secretKey: FAKE_SECRET_KEY });
        await expect(
            gateway.createCheckout({
                reference: "order-2",
                currency: "USD",
                lineItems: [{ name: "Widget", amountMinor: 1000, quantity: 2 }], // sums to 2000
                amountMinor: 500, // disagrees
                successUrl: "https://example.com/ok",
                cancelUrl: "https://example.com/cancel",
            })
        ).rejects.toThrow(/disagree/);
    });

    it("createCheckout() throws (never reaches the network) when given a negative amountMinor", async () => {
        const gateway = new StripeGateway({ secretKey: FAKE_SECRET_KEY });
        await expect(
            gateway.createCheckout({
                reference: "order-3",
                currency: "USD",
                amountMinor: -500,
                successUrl: "https://example.com/ok",
                cancelUrl: "https://example.com/cancel",
            })
        ).rejects.toThrow(/invalid amount/i);
    });

    it("refund() against the REAL Stripe API normalizes a real 'invalid API key' failure into { status: 'failed' } instead of throwing", async () => {
        const gateway = new StripeGateway({ secretKey: FAKE_SECRET_KEY });
        const result = await gateway.refund("pi_does_not_exist");
        expect(result.status).toBe("failed");
        if (result.status === "failed") {
            expect(result.reason).toMatch(/Invalid API Key/);
        }
    });
});

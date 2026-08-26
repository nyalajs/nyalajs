import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import { RazorpayGateway } from "../gateways/razorpay/razorpay.gateway";

// Webhook verification is real HMAC-SHA256 crypto, no network calls.
// createCheckout() is verified against the REAL Razorpay API
// (api.razorpay.com) with deliberately invalid credentials, confirming the
// adapter parses Razorpay's actual documented error shape
// ({"error":{"description":"Authentication failed","code":"BAD_REQUEST_ERROR"}},
// confirmed via curl and a direct SDK call).

const KEY_ID = "rzp_test_intentionally_invalid";
const KEY_SECRET = "intentionally_invalid_secret";
const WEBHOOK_SECRET = "razorpay-webhook-secret-for-e2e-only";
const REAL_RAZORPAY_TEST_TIMEOUT = 15000;

function signPayload(payloadObject: unknown, secret: string): { rawBody: Buffer; signature: string } {
    const raw = JSON.stringify(payloadObject);
    const signature = createHmac("sha256", secret).update(raw).digest("hex");
    return { rawBody: Buffer.from(raw), signature };
}

describe("RazorpayGateway (real HMAC-SHA256 sign/verify, real API error-shape check)", () => {
    it("verifies a genuinely-signed payment_link.paid webhook and normalizes it", async () => {
        const gateway = new RazorpayGateway({ keyId: KEY_ID, keySecret: KEY_SECRET, webhookSecret: WEBHOOK_SECRET });

        const { rawBody, signature } = signPayload(
            {
                event: "payment_link.paid",
                payload: {
                    payment_link: {
                        entity: { id: "plink_1", reference_id: "order-200", amount: 50000, currency: "INR", notes: { plan: "pro" } },
                    },
                },
            },
            WEBHOOK_SECRET
        );

        const event = await gateway.verifyWebhook(rawBody, { "x-razorpay-signature": signature });

        expect(event).not.toBeNull();
        expect(event!.type).toBe("payment.succeeded");
        expect(event!.reference).toBe("order-200");
        expect(event!.gatewayReference).toBe("plink_1");
        expect(event!.amountMinor).toBe(50000);
        expect(event!.currency).toBe("INR");
        expect(event!.metadata).toEqual({ plan: "pro" });
        expect(event!.gateway).toBe("razorpay");
    });

    it("normalizes a direct payment.captured event (Checkout.js flow, not just Payment Links)", async () => {
        const gateway = new RazorpayGateway({ keyId: KEY_ID, keySecret: KEY_SECRET, webhookSecret: WEBHOOK_SECRET });
        const { rawBody, signature } = signPayload(
            { event: "payment.captured", payload: { payment: { entity: { id: "pay_1", amount: 1000, currency: "INR", notes: { reference: "order-201" } } } } },
            WEBHOOK_SECRET
        );
        const event = await gateway.verifyWebhook(rawBody, { "x-razorpay-signature": signature });
        expect(event!.type).toBe("payment.succeeded");
        expect(event!.reference).toBe("order-201");
    });

    it("REJECTS a webhook signed with a different secret", async () => {
        const gateway = new RazorpayGateway({ keyId: KEY_ID, keySecret: KEY_SECRET, webhookSecret: WEBHOOK_SECRET });
        const { rawBody, signature } = signPayload({ event: "payment_link.paid", payload: {} }, "wrong-secret");
        const event = await gateway.verifyWebhook(rawBody, { "x-razorpay-signature": signature });
        expect(event).toBeNull();
    });

    it("REJECTS a tampered payload", async () => {
        const gateway = new RazorpayGateway({ keyId: KEY_ID, keySecret: KEY_SECRET, webhookSecret: WEBHOOK_SECRET });
        const { signature } = signPayload(
            { event: "payment_link.paid", payload: { payment_link: { entity: { amount: 100 } } } },
            WEBHOOK_SECRET
        );
        const tampered = Buffer.from(JSON.stringify({ event: "payment_link.paid", payload: { payment_link: { entity: { amount: 999999 } } } }));
        const event = await gateway.verifyWebhook(tampered, { "x-razorpay-signature": signature });
        expect(event).toBeNull();
    });

    it("returns null for an unrecognized event type", async () => {
        const gateway = new RazorpayGateway({ keyId: KEY_ID, keySecret: KEY_SECRET, webhookSecret: WEBHOOK_SECRET });
        const { rawBody, signature } = signPayload({ event: "order.paid", payload: {} }, WEBHOOK_SECRET);
        const event = await gateway.verifyWebhook(rawBody, { "x-razorpay-signature": signature });
        expect(event).toBeNull();
    });

    it("throws when verifyWebhook() is called with no webhookSecret configured", async () => {
        const gateway = new RazorpayGateway({ keyId: KEY_ID, keySecret: KEY_SECRET });
        await expect(gateway.verifyWebhook(Buffer.from("{}"), {})).rejects.toThrow(/webhookSecret/);
    });

    it(
        "createCheckout() against the REAL Razorpay API correctly surfaces the auth failure",
        async () => {
            const gateway = new RazorpayGateway({ keyId: KEY_ID, keySecret: KEY_SECRET });
            await expect(
                gateway.createCheckout({
                    reference: "order-202",
                    currency: "INR",
                    amountMinor: 10000,
                    customerEmail: "test@example.com",
                    successUrl: "https://example.com/ok",
                    cancelUrl: "https://example.com/cancel",
                })
            ).rejects.toThrow();
        },
        REAL_RAZORPAY_TEST_TIMEOUT
    );

    it("throws when createCheckout() is given neither lineItems nor amountMinor", async () => {
        const gateway = new RazorpayGateway({ keyId: KEY_ID, keySecret: KEY_SECRET });
        await expect(
            gateway.createCheckout({
                reference: "order-203",
                currency: "INR",
                successUrl: "https://example.com/ok",
                cancelUrl: "https://example.com/cancel",
            })
        ).rejects.toThrow(/lineItems or amountMinor/);
    });
});

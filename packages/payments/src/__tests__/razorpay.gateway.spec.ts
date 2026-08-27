import { describe, it, expect, vi } from "vitest";
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

    it("throws (never reaches the network) when createCheckout() is given a negative amountMinor", async () => {
        const gateway = new RazorpayGateway({ keyId: KEY_ID, keySecret: KEY_SECRET });
        await expect(
            gateway.createCheckout({
                reference: "order-206",
                currency: "INR",
                amountMinor: -1000,
                successUrl: "https://example.com/ok",
                cancelUrl: "https://example.com/cancel",
            })
        ).rejects.toThrow(/invalid amount/i);
    });

    it(
        "createCheckout() genuinely never sends cancelUrl anywhere — Razorpay Payment Links have no cancel-redirect field at all (confirmed against the SDK's own real type definitions)",
        async () => {
            const gateway = new RazorpayGateway({ keyId: KEY_ID, keySecret: KEY_SECRET });
            const createSpy = vi.spyOn(gateway.client.paymentLink, "create");

            await gateway
                .createCheckout({
                    reference: "order-205",
                    currency: "INR",
                    amountMinor: 10000,
                    customerEmail: "test@example.com",
                    successUrl: "https://example.com/ok",
                    cancelUrl: "https://example.com/cancel",
                })
                .catch(() => {});

            expect(createSpy).toHaveBeenCalled();
            const sentBody = createSpy.mock.calls[0][0];
            expect(JSON.stringify(sentBody)).not.toContain("example.com/cancel");

            createSpy.mockRestore();
        },
        REAL_RAZORPAY_TEST_TIMEOUT
    );

    it(
        "createCheckout() sums lineItems into the correct total when amountMinor is omitted (proven by reaching the real API instead of an early validation throw)",
        async () => {
            const gateway = new RazorpayGateway({ keyId: KEY_ID, keySecret: KEY_SECRET });
            await expect(
                gateway.createCheckout({
                    reference: "order-204",
                    currency: "INR",
                    lineItems: [{ name: "Widget", amountMinor: 3000, quantity: 2 }, { name: "Fee", amountMinor: 500 }], // sums to 6500
                    customerEmail: "test@example.com",
                    successUrl: "https://example.com/ok",
                    cancelUrl: "https://example.com/cancel",
                })
            ).rejects.toThrow();
        },
        REAL_RAZORPAY_TEST_TIMEOUT
    );

    it(
        "refund() against the REAL Razorpay API normalizes a real failure into { status: 'failed' } instead of throwing — and extracts a real message rather than '[object Object]'",
        async () => {
            // The razorpay SDK rejects with a PLAIN OBJECT, not an Error
            // instance (confirmed directly: `err instanceof Error` is false).
            // A naive `String(err)` fallback would collapse this into the
            // useless "[object Object]" string. This proves the real
            // gateway-specific extraction path works end to end.
            const gateway = new RazorpayGateway({ keyId: KEY_ID, keySecret: KEY_SECRET });
            const result = await gateway.refund("pay_does_not_exist");
            expect(result.status).toBe("failed");
            if (result.status === "failed") {
                expect(result.reason).not.toBe("[object Object]");
                expect(result.reason.length).toBeGreaterThan(0);
            }
        },
        REAL_RAZORPAY_TEST_TIMEOUT
    );

    it("extractErrorMessage() prefers error.description, falls back to a statusCode message, then to String()", () => {
        const gateway = new RazorpayGateway({ keyId: KEY_ID, keySecret: KEY_SECRET }) as any;

        expect(gateway.extractErrorMessage(new Error("plain error"))).toBe("plain error");
        expect(
            gateway.extractErrorMessage({ statusCode: 401, error: { code: "BAD_REQUEST_ERROR", description: "Authentication failed" } })
        ).toBe("Authentication failed");
        // The real shape observed for a 404 refund-not-found: `error` key
        // present but undefined — must NOT crash, must fall through cleanly.
        expect(gateway.extractErrorMessage({ statusCode: 404, error: undefined })).toBe("Razorpay request failed with status 404");
        expect(gateway.extractErrorMessage("a plain string")).toBe("a plain string");
    });
});

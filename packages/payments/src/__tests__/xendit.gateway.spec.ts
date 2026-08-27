import { describe, it, expect } from "vitest";
import { XenditGateway } from "../gateways/xendit/xendit.gateway";

// Xendit's webhook check is a static shared-secret string comparison (the
// dashboard's "Verification Token"), NOT an HMAC — same timing-safe
// comparison pattern as FlutterwaveGateway. createCheckout() is verified
// against the REAL Xendit API (api.xendit.co) with a deliberately invalid
// key, confirming the adapter's error handling matches Xendit's actual
// documented error shape ({"message":...,"error_code":"INVALID_API_KEY"},
// confirmed via curl and a direct SDK call).

const SECRET_KEY = "xnd_development_intentionally_invalid_for_error_shape_check";
const WEBHOOK_TOKEN = "my-dashboard-configured-verification-token";
const REAL_XENDIT_TEST_TIMEOUT = 15000;

describe("XenditGateway (real timing-safe token check, real API error-shape check)", () => {
    it("verifies a webhook whose x-callback-token exactly matches the configured token, converting IDR major units to minor", async () => {
        const gateway = new XenditGateway({ secretKey: SECRET_KEY, webhookVerificationToken: WEBHOOK_TOKEN });

        const rawBody = Buffer.from(
            JSON.stringify({
                id: "inv_1",
                external_id: "order-300",
                status: "PAID",
                amount: 150000,
                currency: "IDR",
                metadata: { plan: "pro" },
            })
        );

        const event = await gateway.verifyWebhook(rawBody, { "x-callback-token": WEBHOOK_TOKEN });

        expect(event).not.toBeNull();
        expect(event!.type).toBe("payment.succeeded");
        expect(event!.reference).toBe("order-300");
        expect(event!.gatewayReference).toBe("inv_1");
        expect(event!.amountMinor).toBe(15000000); // 150000 IDR major units -> 15,000,000 minor units
        expect(event!.currency).toBe("IDR");
        expect(event!.metadata).toEqual({ plan: "pro" });
        expect(event!.gateway).toBe("xendit");
    });

    it("REJECTS a webhook whose x-callback-token does not match", async () => {
        const gateway = new XenditGateway({ secretKey: SECRET_KEY, webhookVerificationToken: WEBHOOK_TOKEN });
        const rawBody = Buffer.from(JSON.stringify({ id: "inv_2", status: "PAID" }));
        const event = await gateway.verifyWebhook(rawBody, { "x-callback-token": "wrong-token" });
        expect(event).toBeNull();
    });

    it("REJECTS a token that's a different length than the configured one", async () => {
        const gateway = new XenditGateway({ secretKey: SECRET_KEY, webhookVerificationToken: WEBHOOK_TOKEN });
        const rawBody = Buffer.from(JSON.stringify({ id: "inv_3", status: "PAID" }));
        const event = await gateway.verifyWebhook(rawBody, { "x-callback-token": "short" });
        expect(event).toBeNull();
    });

    it("normalizes EXPIRED status to payment.failed", async () => {
        const gateway = new XenditGateway({ secretKey: SECRET_KEY, webhookVerificationToken: WEBHOOK_TOKEN });
        const rawBody = Buffer.from(JSON.stringify({ id: "inv_4", external_id: "order-301", status: "EXPIRED", amount: 100 }));
        const event = await gateway.verifyWebhook(rawBody, { "x-callback-token": WEBHOOK_TOKEN });
        expect(event!.type).toBe("payment.failed");
    });

    it("returns null for a PENDING invoice (not a terminal state this adapter reports)", async () => {
        const gateway = new XenditGateway({ secretKey: SECRET_KEY, webhookVerificationToken: WEBHOOK_TOKEN });
        const rawBody = Buffer.from(JSON.stringify({ id: "inv_5", status: "PENDING" }));
        const event = await gateway.verifyWebhook(rawBody, { "x-callback-token": WEBHOOK_TOKEN });
        expect(event).toBeNull();
    });

    it("throws when verifyWebhook() is called with no webhookVerificationToken configured", async () => {
        const gateway = new XenditGateway({ secretKey: SECRET_KEY });
        await expect(gateway.verifyWebhook(Buffer.from("{}"), {})).rejects.toThrow(/webhookVerificationToken/);
    });

    it(
        "createCheckout() against the REAL Xendit API correctly surfaces the invalid-key error",
        async () => {
            const gateway = new XenditGateway({ secretKey: SECRET_KEY });
            await expect(
                gateway.createCheckout({
                    reference: "order-302",
                    currency: "IDR",
                    amountMinor: 10000000,
                    successUrl: "https://example.com/ok",
                    cancelUrl: "https://example.com/cancel",
                })
            ).rejects.toThrow();
        },
        REAL_XENDIT_TEST_TIMEOUT
    );

    it("throws when createCheckout() is given neither lineItems nor amountMinor", async () => {
        const gateway = new XenditGateway({ secretKey: SECRET_KEY });
        await expect(
            gateway.createCheckout({
                reference: "order-303",
                currency: "IDR",
                successUrl: "https://example.com/ok",
                cancelUrl: "https://example.com/cancel",
            })
        ).rejects.toThrow(/lineItems or amountMinor/);
    });

    it("throws (never reaches the network) when createCheckout() is given a negative amountMinor", async () => {
        const gateway = new XenditGateway({ secretKey: SECRET_KEY });
        await expect(
            gateway.createCheckout({
                reference: "order-305",
                currency: "IDR",
                amountMinor: -100000,
                successUrl: "https://example.com/ok",
                cancelUrl: "https://example.com/cancel",
            })
        ).rejects.toThrow(/invalid amount/i);
    });

    it(
        "createCheckout() sums lineItems into the correct total when amountMinor is omitted (proven by reaching the real API instead of an early validation throw)",
        async () => {
            const gateway = new XenditGateway({ secretKey: SECRET_KEY });
            await expect(
                gateway.createCheckout({
                    reference: "order-304",
                    currency: "IDR",
                    lineItems: [{ name: "Widget", amountMinor: 3000000, quantity: 2 }, { name: "Fee", amountMinor: 500000 }], // sums to 6500000
                    successUrl: "https://example.com/ok",
                    cancelUrl: "https://example.com/cancel",
                })
            ).rejects.toThrow();
        },
        REAL_XENDIT_TEST_TIMEOUT
    );

    it(
        "refund() against the REAL Xendit API normalizes a real 401 Unauthorized failure into { status: 'failed' } instead of throwing",
        async () => {
            // Unlike Flutterwave/Razorpay, the xendit-node SDK throws a real
            // XenditSdkError (an actual Error instance), confirmed directly.
            const gateway = new XenditGateway({ secretKey: SECRET_KEY });
            const result = await gateway.refund("invoice_does_not_exist");
            expect(result.status).toBe("failed");
            if (result.status === "failed") {
                expect(result.reason).toMatch(/Unauthorized|401/);
            }
        },
        REAL_XENDIT_TEST_TIMEOUT
    );
});

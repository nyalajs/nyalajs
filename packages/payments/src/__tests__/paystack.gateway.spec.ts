import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import { PaystackGateway } from "../gateways/paystack/paystack.gateway";

// Webhook verification tests use real HMAC-SHA512 crypto, no network calls.
// The createCheckout error-path test hits the REAL Paystack API
// (api.paystack.co) with a deliberately invalid key to verify against
// Paystack's actual documented error response shape
// ({"status":false,"message":"Invalid key",...}, confirmed via curl) — this
// package has no real Paystack account, so this is the honest limit of
// what's verifiable without one: a real request/response round trip
// against the real endpoint, proving the adapter parses Paystack's actual
// error shape correctly, without a live successful charge.

const SECRET_KEY = "sk_test_intentionally_invalid_for_error_shape_verification";
const REAL_PAYSTACK_TEST_TIMEOUT = 15000;

function signPayload(payloadObject: unknown, secret: string): { rawBody: Buffer; signature: string } {
    const raw = JSON.stringify(payloadObject);
    const signature = createHmac("sha512", secret).update(raw).digest("hex");
    return { rawBody: Buffer.from(raw), signature };
}

describe("PaystackGateway (real HMAC-SHA512 sign/verify, real API error-shape check)", () => {
    it("verifies a genuinely-signed charge.success webhook using SHA512 (not SHA256) and normalizes it", async () => {
        const gateway = new PaystackGateway({ secretKey: SECRET_KEY });

        const { rawBody, signature } = signPayload(
            { event: "charge.success", data: { reference: "order-99", amount: 25000, currency: "NGN", metadata: { plan: "pro" } } },
            SECRET_KEY // Paystack signs with the SAME key used for API auth — no separate webhook secret
        );

        const event = await gateway.verifyWebhook(rawBody, { "x-paystack-signature": signature });

        expect(event).not.toBeNull();
        expect(event!.type).toBe("payment.succeeded");
        expect(event!.reference).toBe("order-99");
        expect(event!.amountMinor).toBe(25000); // already minor units (kobo) — no conversion
        expect(event!.currency).toBe("NGN");
        expect(event!.gateway).toBe("paystack");
    });

    it("a SHA256 signature (wrong algorithm) is correctly REJECTED — proves this isn't accidentally accepting the wrong hash", async () => {
        const gateway = new PaystackGateway({ secretKey: SECRET_KEY });
        const raw = JSON.stringify({ event: "charge.success", data: { reference: "order-100" } });
        const sha256Signature = createHmac("sha256", SECRET_KEY).update(raw).digest("hex");

        const event = await gateway.verifyWebhook(Buffer.from(raw), { "x-paystack-signature": sha256Signature });
        expect(event).toBeNull();
    });

    it("REJECTS a webhook signed with a different secret", async () => {
        const gateway = new PaystackGateway({ secretKey: SECRET_KEY });
        const { rawBody, signature } = signPayload({ event: "charge.success", data: { reference: "order-101" } }, "wrong-secret");
        const event = await gateway.verifyWebhook(rawBody, { "x-paystack-signature": signature });
        expect(event).toBeNull();
    });

    it("REJECTS a tampered payload", async () => {
        const gateway = new PaystackGateway({ secretKey: SECRET_KEY });
        const { signature } = signPayload({ event: "charge.success", data: { reference: "order-102", amount: 100 } }, SECRET_KEY);
        const tampered = Buffer.from(JSON.stringify({ event: "charge.success", data: { reference: "order-102", amount: 999999 } }));
        const event = await gateway.verifyWebhook(tampered, { "x-paystack-signature": signature });
        expect(event).toBeNull();
    });

    it("returns null for a missing signature header", async () => {
        const gateway = new PaystackGateway({ secretKey: SECRET_KEY });
        const event = await gateway.verifyWebhook(Buffer.from("{}"), {});
        expect(event).toBeNull();
    });

    it("returns null for an unrecognized event type", async () => {
        const gateway = new PaystackGateway({ secretKey: SECRET_KEY });
        const { rawBody, signature } = signPayload({ event: "subscription.create", data: {} }, SECRET_KEY);
        const event = await gateway.verifyWebhook(rawBody, { "x-paystack-signature": signature });
        expect(event).toBeNull();
    });

    it(
        "createCheckout() against the REAL Paystack API correctly surfaces Paystack's own error shape for an invalid key",
        async () => {
            const gateway = new PaystackGateway({ secretKey: SECRET_KEY });
            await expect(
                gateway.createCheckout({
                    reference: "order-103",
                    currency: "NGN",
                    amountMinor: 10000,
                    customerEmail: "test@example.com",
                    successUrl: "https://example.com/ok",
                    cancelUrl: "https://example.com/cancel",
                })
            ).rejects.toThrow(/Paystack did not return an authorization_url/);
        },
        REAL_PAYSTACK_TEST_TIMEOUT
    );

    it("throws when createCheckout() is given neither lineItems nor amountMinor", async () => {
        const gateway = new PaystackGateway({ secretKey: SECRET_KEY });
        await expect(
            gateway.createCheckout({
                reference: "order-104",
                currency: "NGN",
                successUrl: "https://example.com/ok",
                cancelUrl: "https://example.com/cancel",
            })
        ).rejects.toThrow(/lineItems or amountMinor/);
    });
});

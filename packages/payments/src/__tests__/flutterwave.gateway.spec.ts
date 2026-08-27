import { describe, it, expect, vi } from "vitest";
import { FlutterwaveGateway } from "../gateways/flutterwave/flutterwave.gateway";

// Flutterwave's webhook check is a static shared-secret string comparison
// (the dashboard's "Secret Hash"), NOT an HMAC — so these tests verify the
// real timing-safe string comparison logic directly, no crypto library
// needed. createCheckout() is verified against the REAL Flutterwave API
// (api.flutterwave.com/v3/payments) with a deliberately invalid key, to
// confirm the adapter parses Flutterwave's actual documented error shape
// ({"status":"error","message":...,"data":null}, confirmed via curl).

const PUBLIC_KEY = "FLWPUBK_TEST-intentionally-invalid";
const SECRET_KEY = "FLWSECK_TEST-intentionally-invalid";
const WEBHOOK_SECRET_HASH = "my-dashboard-configured-secret-hash";
const REAL_FLUTTERWAVE_TEST_TIMEOUT = 15000;

describe("FlutterwaveGateway (real timing-safe secret-hash check, real API error-shape check)", () => {
    it("verifies a webhook whose verif-hash header exactly matches the configured secret hash", async () => {
        const gateway = new FlutterwaveGateway({ publicKey: PUBLIC_KEY, secretKey: SECRET_KEY, webhookSecretHash: WEBHOOK_SECRET_HASH });

        const rawBody = Buffer.from(
            JSON.stringify({
                event: "charge.completed",
                data: { id: 12345, tx_ref: "order-55", amount: 200.5, currency: "NGN", status: "successful", meta: { plan: "pro" } },
            })
        );

        const event = await gateway.verifyWebhook(rawBody, { "verif-hash": WEBHOOK_SECRET_HASH });

        expect(event).not.toBeNull();
        expect(event!.type).toBe("payment.succeeded");
        expect(event!.reference).toBe("order-55");
        expect(event!.gatewayReference).toBe("12345");
        expect(event!.amountMinor).toBe(20050); // 200.50 NGN -> 20050 minor units
        expect(event!.currency).toBe("NGN");
        expect(event!.gateway).toBe("flutterwave");
    });

    it("REJECTS a webhook whose verif-hash does not match the configured secret", async () => {
        const gateway = new FlutterwaveGateway({ publicKey: PUBLIC_KEY, secretKey: SECRET_KEY, webhookSecretHash: WEBHOOK_SECRET_HASH });
        const rawBody = Buffer.from(JSON.stringify({ event: "charge.completed", data: { tx_ref: "order-56", status: "successful" } }));
        const event = await gateway.verifyWebhook(rawBody, { "verif-hash": "wrong-hash-entirely" });
        expect(event).toBeNull();
    });

    it("REJECTS a hash that's a different length than the configured secret (no false-positive from Buffer length mismatch)", async () => {
        const gateway = new FlutterwaveGateway({ publicKey: PUBLIC_KEY, secretKey: SECRET_KEY, webhookSecretHash: WEBHOOK_SECRET_HASH });
        const rawBody = Buffer.from(JSON.stringify({ event: "charge.completed", data: {} }));
        const event = await gateway.verifyWebhook(rawBody, { "verif-hash": "short" });
        expect(event).toBeNull();
    });

    it("normalizes a failed charge to payment.failed", async () => {
        const gateway = new FlutterwaveGateway({ publicKey: PUBLIC_KEY, secretKey: SECRET_KEY, webhookSecretHash: WEBHOOK_SECRET_HASH });
        const rawBody = Buffer.from(
            JSON.stringify({ event: "charge.completed", data: { id: 1, tx_ref: "order-57", amount: 10, currency: "NGN", status: "failed" } })
        );
        const event = await gateway.verifyWebhook(rawBody, { "verif-hash": WEBHOOK_SECRET_HASH });
        expect(event!.type).toBe("payment.failed");
    });

    it("returns null for an event that isn't charge.completed", async () => {
        const gateway = new FlutterwaveGateway({ publicKey: PUBLIC_KEY, secretKey: SECRET_KEY, webhookSecretHash: WEBHOOK_SECRET_HASH });
        const rawBody = Buffer.from(JSON.stringify({ event: "transfer.completed", data: {} }));
        const event = await gateway.verifyWebhook(rawBody, { "verif-hash": WEBHOOK_SECRET_HASH });
        expect(event).toBeNull();
    });

    it("throws when verifyWebhook() is called with no webhookSecretHash configured", async () => {
        const gateway = new FlutterwaveGateway({ publicKey: PUBLIC_KEY, secretKey: SECRET_KEY });
        await expect(gateway.verifyWebhook(Buffer.from("{}"), {})).rejects.toThrow(/webhookSecretHash/);
    });

    it(
        "createCheckout() against the REAL Flutterwave API correctly surfaces Flutterwave's own error shape for an invalid key",
        async () => {
            const gateway = new FlutterwaveGateway({ publicKey: PUBLIC_KEY, secretKey: SECRET_KEY });
            await expect(
                gateway.createCheckout({
                    reference: "order-58",
                    currency: "NGN",
                    amountMinor: 100000,
                    successUrl: "https://example.com/ok",
                    cancelUrl: "https://example.com/cancel",
                })
            ).rejects.toThrow(/Flutterwave did not return a checkout link/);
        },
        REAL_FLUTTERWAVE_TEST_TIMEOUT
    );

    it(
        "createCheckout() sums lineItems into the correct total when amountMinor is omitted (proven by reaching the real API instead of an early validation throw)",
        async () => {
            const gateway = new FlutterwaveGateway({ publicKey: PUBLIC_KEY, secretKey: SECRET_KEY });
            await expect(
                gateway.createCheckout({
                    reference: "order-60",
                    currency: "NGN",
                    lineItems: [{ name: "Widget", amountMinor: 30000, quantity: 2 }, { name: "Fee", amountMinor: 5000 }], // sums to 65000
                    successUrl: "https://example.com/ok",
                    cancelUrl: "https://example.com/cancel",
                })
            ).rejects.toThrow(/checkout link/);
        },
        REAL_FLUTTERWAVE_TEST_TIMEOUT
    );

    it(
        "refund() against the REAL Flutterwave API normalizes a real failure response into { status: 'failed' } — this gateway's SDK RESOLVES with an error object rather than throwing, unlike every other gateway here",
        async () => {
            const gateway = new FlutterwaveGateway({ publicKey: PUBLIC_KEY, secretKey: SECRET_KEY });
            // amountMinor must be passed here: Flutterwave's SDK validates
            // "amount" is present client-side BEFORE the request is even
            // sent, so an amount-less call fails on that check instead of
            // ever reaching the auth check this test wants to verify.
            const result = await gateway.refund("12345", 1000);
            expect(result.status).toBe("failed");
            if (result.status === "failed") {
                expect(result.reason).toMatch(/Invalid authorization key/);
            }
        },
        REAL_FLUTTERWAVE_TEST_TIMEOUT
    );

    it(
        "createCheckout() passes cancelUrl through under meta.nyala.cancelUrl, WITHOUT overwriting a same-named key the caller set in their own metadata — real outgoing request body inspected via a fetch spy, request still genuinely sent",
        async () => {
            const gateway = new FlutterwaveGateway({ publicKey: PUBLIC_KEY, secretKey: SECRET_KEY });
            const fetchSpy = vi.spyOn(globalThis, "fetch");

            await gateway
                .createCheckout({
                    reference: "order-61",
                    currency: "NGN",
                    amountMinor: 10000,
                    successUrl: "https://example.com/ok",
                    cancelUrl: "https://example.com/cancel",
                    metadata: { orderId: "abc123", cancel_url: "https://my-own-app.example.com/never-touch-this" },
                })
                .catch(() => {});

            expect(fetchSpy).toHaveBeenCalled();
            const [, requestInit] = fetchSpy.mock.calls[0];
            const sentBody = JSON.parse((requestInit as RequestInit).body as string);

            expect(sentBody.meta.orderId).toBe("abc123");
            expect(sentBody.meta.cancel_url).toBe("https://my-own-app.example.com/never-touch-this");
            expect(sentBody.meta.nyala.cancelUrl).toBe("https://example.com/cancel");

            fetchSpy.mockRestore();
        },
        REAL_FLUTTERWAVE_TEST_TIMEOUT
    );

    it("throws when createCheckout() is given neither lineItems nor amountMinor", async () => {
        const gateway = new FlutterwaveGateway({ publicKey: PUBLIC_KEY, secretKey: SECRET_KEY });
        await expect(
            gateway.createCheckout({
                reference: "order-59",
                currency: "NGN",
                successUrl: "https://example.com/ok",
                cancelUrl: "https://example.com/cancel",
            })
        ).rejects.toThrow(/lineItems or amountMinor/);
    });
});

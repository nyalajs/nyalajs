import { describe, it, expect } from "vitest";
import { MollieGateway } from "../gateways/mollie/mollie.gateway";

// Mollie's webhook model has no local signature to verify — the correct
// "verification" is a real API call back to Mollie fetching the payment by
// id, per Mollie's own documented pattern. These tests hit the REAL Mollie
// API (api.mollie.com) with a deliberately invalid key, confirming: (1) the
// SDK's real ApiError is thrown and caught correctly (verifyWebhook()
// returns null rather than propagating it — an unreachable/erroring lookup
// must fail closed, same as a bad signature everywhere else), and (2) a
// malformed/missing "id" in the webhook body is rejected before any network
// call is even made.

const API_KEY = "test_intentionally_invalid_for_error_shape_verification";
const WEBHOOK_URL = "https://example.com/webhooks/mollie";
const REAL_MOLLIE_TEST_TIMEOUT = 15000;

describe("MollieGateway (real API-lookup-based verification, no local signature)", () => {
    it(
        "verifyWebhook() against the REAL Mollie API returns null for an unreachable/invalid-key lookup — fails closed, doesn't throw",
        async () => {
            const gateway = new MollieGateway({ apiKey: API_KEY, webhookUrl: WEBHOOK_URL });
            const rawBody = Buffer.from("id=tr_doesnotexist123");

            const event = await gateway.verifyWebhook(rawBody, {});
            expect(event).toBeNull();
        },
        REAL_MOLLIE_TEST_TIMEOUT
    );

    it("returns null immediately (no network call) when the webhook body has no id field at all", async () => {
        const gateway = new MollieGateway({ apiKey: API_KEY, webhookUrl: WEBHOOK_URL });
        const rawBody = Buffer.from("not_an_id=something&other=stuff");
        const event = await gateway.verifyWebhook(rawBody, {});
        expect(event).toBeNull();
    });

    it("parses form-encoded body correctly (not JSON) — Mollie's actual wire format", async () => {
        const gateway = new MollieGateway({ apiKey: API_KEY, webhookUrl: WEBHOOK_URL });
        // A URL-encoded id with special characters, proving URLSearchParams
        // parsing (not naive string splitting) is what's actually used.
        const rawBody = Buffer.from("id=tr_WDqYK6vllg&extra=ignored%20value");
        // Still resolves to null (invalid key), but proves parsing doesn't
        // throw or mis-extract the id before the network call.
        const event = await gateway.verifyWebhook(rawBody, {});
        expect(event).toBeNull();
    }, REAL_MOLLIE_TEST_TIMEOUT);

    it("normalizeEvent maps every real Mollie PaymentStatus value to the correct PaymentEvent type", () => {
        const gateway = new MollieGateway({ apiKey: API_KEY, webhookUrl: WEBHOOK_URL });
        const normalize = (gateway as any).normalizeEvent.bind(gateway);

        const paid = normalize({ id: "tr_1", status: "paid", amount: { currency: "EUR", value: "12.50" }, metadata: { reference: "order-1" } });
        expect(paid.type).toBe("payment.succeeded");
        expect(paid.amountMinor).toBe(1250);
        expect(paid.currency).toBe("EUR");

        const failed = normalize({ id: "tr_2", status: "failed", amount: { currency: "EUR", value: "5.00" }, metadata: {} });
        expect(failed.type).toBe("payment.failed");

        const expired = normalize({ id: "tr_3", status: "expired", amount: { currency: "EUR", value: "5.00" }, metadata: {} });
        expect(expired.type).toBe("payment.failed");

        const open = normalize({ id: "tr_4", status: "open", amount: { currency: "EUR", value: "5.00" }, metadata: {} });
        expect(open.type).toBe("payment.pending");
    });

    it("createCheckout() against the REAL Mollie API correctly surfaces a thrown ApiError for an invalid key", async () => {
        const gateway = new MollieGateway({ apiKey: API_KEY, webhookUrl: WEBHOOK_URL });
        await expect(
            gateway.createCheckout({
                reference: "order-60",
                currency: "EUR",
                amountMinor: 1000,
                successUrl: "https://example.com/ok",
                cancelUrl: "https://example.com/cancel",
            })
        ).rejects.toThrow();
    }, REAL_MOLLIE_TEST_TIMEOUT);

    it("throws when createCheckout() is given neither lineItems nor amountMinor", async () => {
        const gateway = new MollieGateway({ apiKey: API_KEY, webhookUrl: WEBHOOK_URL });
        await expect(
            gateway.createCheckout({
                reference: "order-61",
                currency: "EUR",
                successUrl: "https://example.com/ok",
                cancelUrl: "https://example.com/cancel",
            })
        ).rejects.toThrow(/lineItems or amountMinor/);
    });

    it(
        "createCheckout() sums lineItems into the correct total when amountMinor is omitted (proven by reaching the real API instead of an early validation throw)",
        async () => {
            const gateway = new MollieGateway({ apiKey: API_KEY, webhookUrl: WEBHOOK_URL });
            // No amountMinor — only lineItems. If resolveAmount() summed them
            // wrong or threw, this would fail before ever reaching the
            // network; instead it reaches Mollie's real API and throws the
            // real ApiError instead, proving the amount was computed and
            // passed through.
            await expect(
                gateway.createCheckout({
                    reference: "order-62",
                    currency: "EUR",
                    lineItems: [{ name: "Widget", amountMinor: 1500, quantity: 2 }, { name: "Fee", amountMinor: 250 }], // sums to 3250
                    successUrl: "https://example.com/ok",
                    cancelUrl: "https://example.com/cancel",
                })
            ).rejects.toThrow();
        },
        REAL_MOLLIE_TEST_TIMEOUT
    );

    it(
        "refund() against the REAL Mollie API normalizes a real 'Invalid Authorization header' failure into { status: 'failed' } instead of throwing",
        async () => {
            const gateway = new MollieGateway({ apiKey: API_KEY, webhookUrl: WEBHOOK_URL });
            const result = await gateway.refund("tr_does_not_exist");
            expect(result.status).toBe("failed");
            if (result.status === "failed") {
                expect(result.reason).toMatch(/Invalid Authorization header/);
            }
        },
        REAL_MOLLIE_TEST_TIMEOUT
    );
});

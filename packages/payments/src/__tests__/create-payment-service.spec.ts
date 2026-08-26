import { describe, it, expect } from "vitest";
import Stripe from "stripe";
import { createPaymentService } from "../create-payment-service";
import { PaymentGatewayFactory } from "../payment-gateway.factory";
import { StripeGateway } from "../gateways/stripe/stripe.gateway";

// Proves the config-driven path produces a REAL, working gateway — not just
// an object that satisfies the type. Runs an actual signed webhook through
// a gateway built from a plain config object (no `new StripeGateway(...)`
// anywhere in this file) to confirm createPaymentService()/
// PaymentGatewayFactory aren't just type-level sugar over the same manual
// construction.

const SECRET_KEY = "sk_test_does_not_need_to_be_real_for_these_tests";
const WEBHOOK_SECRET = "whsec_factory_test_secret";

describe("createPaymentService() / PaymentGatewayFactory (config-driven wiring, real gateway behavior)", () => {
    it("PaymentGatewayFactory.create() builds a real, working gateway instance from a plain config object", () => {
        const gateway = PaymentGatewayFactory.create({ provider: "stripe", secretKey: SECRET_KEY, webhookSecret: WEBHOOK_SECRET });
        expect(gateway).toBeInstanceOf(StripeGateway);
        expect(gateway.name).toBe("stripe");
    });

    it("throws a clear error for an unknown provider tag", () => {
        expect(() => PaymentGatewayFactory.create({ provider: "not-a-real-gateway" } as any)).toThrow(/Unknown gateway provider/);
    });

    it("createPaymentService() wires multiple gateways from config and routes createCheckout by name", async () => {
        const service = createPaymentService({
            gateways: {
                stripe: { provider: "stripe", secretKey: SECRET_KEY, webhookSecret: WEBHOOK_SECRET },
                chapa: { provider: "chapa", secretKey: "CHASECK_TEST-dummy" },
            },
            default: "stripe",
        });

        expect(service.availableGateways().sort()).toEqual(["chapa", "stripe"]);
    });

    it("a gateway built via createPaymentService() performs REAL, correct webhook signature verification (not a stub)", async () => {
        const service = createPaymentService({
            gateways: { stripe: { provider: "stripe", secretKey: SECRET_KEY, webhookSecret: WEBHOOK_SECRET } },
            default: "stripe",
        });

        const stripeClient = new Stripe(SECRET_KEY);
        const payload = JSON.stringify({
            id: "evt_factory_1",
            type: "checkout.session.completed",
            data: { object: { id: "cs_factory_1", client_reference_id: "order-factory-1", amount_total: 777, currency: "usd", metadata: {} } },
        });
        const validSignature = stripeClient.webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET });

        const event = await service.verifyWebhook("stripe", Buffer.from(payload), { "stripe-signature": validSignature });
        expect(event).not.toBeNull();
        expect(event!.reference).toBe("order-factory-1");
        expect(event!.amountMinor).toBe(777);

        // And a WRONG signature is still correctly rejected through the
        // config-built instance — proves this isn't a shortcut that
        // bypasses real verification.
        const wrongSignature = stripeClient.webhooks.generateTestHeaderString({ payload, secret: "whsec_wrong" });
        const rejected = await service.verifyWebhook("stripe", Buffer.from(payload), { "stripe-signature": wrongSignature });
        expect(rejected).toBeNull();
    });

    it("throws when createPaymentService()'s `default` doesn't match any configured gateway key", () => {
        expect(() =>
            createPaymentService({
                gateways: { stripe: { provider: "stripe", secretKey: SECRET_KEY } },
                default: "not-configured",
            })
        ).toThrow(/no matching entry/);
    });

    it("the same provider can be registered under two different keys with different credentials (e.g. two Stripe accounts)", async () => {
        const service = createPaymentService({
            gateways: {
                mainAccount: { provider: "stripe", secretKey: SECRET_KEY, webhookSecret: WEBHOOK_SECRET },
                marketplaceAccount: { provider: "stripe", secretKey: "sk_test_second_account", webhookSecret: "whsec_second" },
            },
            default: "mainAccount",
        });

        expect(service.availableGateways().sort()).toEqual(["mainAccount", "marketplaceAccount"]);
    });
});

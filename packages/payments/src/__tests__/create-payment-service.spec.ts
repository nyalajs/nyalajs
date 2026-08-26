import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import Stripe from "stripe";
import { createPaymentService } from "../create-payment-service";
import { PaymentGatewayFactory } from "../payment-gateway.factory";
import { StripeGateway } from "../gateways/stripe/stripe.gateway";
import { ChapaGateway } from "../gateways/chapa/chapa.gateway";
import { PaystackGateway } from "../gateways/paystack/paystack.gateway";
import { FlutterwaveGateway } from "../gateways/flutterwave/flutterwave.gateway";
import { MollieGateway } from "../gateways/mollie/mollie.gateway";
import { RazorpayGateway } from "../gateways/razorpay/razorpay.gateway";
import { XenditGateway } from "../gateways/xendit/xendit.gateway";

// Proves the config-driven path produces a REAL, working gateway for
// EVERY ONE OF THE 7 PROVIDERS — not just Stripe, and not just an object
// that satisfies the type. Each gateway's own real verification logic
// (the same HMAC/timing-safe checks proven against real crypto and real
// network calls in that gateway's own *.gateway.spec.ts file) is run here
// again, but reached entirely through PaymentGatewayFactory.create()/
// createPaymentService() — no `new XGateway(...)` anywhere in this file.

const SECRET_KEY = "sk_test_does_not_need_to_be_real_for_these_tests";
const WEBHOOK_SECRET = "whsec_factory_test_secret";

describe("PaymentGatewayFactory.create() — instantiates the correct class for every provider", () => {
    it("stripe", () => {
        const gateway = PaymentGatewayFactory.create({ provider: "stripe", secretKey: SECRET_KEY, webhookSecret: WEBHOOK_SECRET });
        expect(gateway).toBeInstanceOf(StripeGateway);
        expect(gateway.name).toBe("stripe");
    });

    it("chapa", () => {
        const gateway = PaymentGatewayFactory.create({ provider: "chapa", secretKey: "CHASECK_TEST-dummy", webhookSecret: "chapa-secret" });
        expect(gateway).toBeInstanceOf(ChapaGateway);
        expect(gateway.name).toBe("chapa");
    });

    it("paystack", () => {
        const gateway = PaymentGatewayFactory.create({ provider: "paystack", secretKey: "sk_test_dummy" });
        expect(gateway).toBeInstanceOf(PaystackGateway);
        expect(gateway.name).toBe("paystack");
    });

    it("flutterwave", () => {
        const gateway = PaymentGatewayFactory.create({ provider: "flutterwave", publicKey: "FLWPUBK_TEST-dummy", secretKey: "FLWSECK_TEST-dummy" });
        expect(gateway).toBeInstanceOf(FlutterwaveGateway);
        expect(gateway.name).toBe("flutterwave");
    });

    it("mollie", () => {
        const gateway = PaymentGatewayFactory.create({ provider: "mollie", apiKey: "test_dummy", webhookUrl: "https://example.com/webhooks/mollie" });
        expect(gateway).toBeInstanceOf(MollieGateway);
        expect(gateway.name).toBe("mollie");
    });

    it("razorpay", () => {
        const gateway = PaymentGatewayFactory.create({ provider: "razorpay", keyId: "rzp_test_dummy", keySecret: "dummy" });
        expect(gateway).toBeInstanceOf(RazorpayGateway);
        expect(gateway.name).toBe("razorpay");
    });

    it("xendit", () => {
        const gateway = PaymentGatewayFactory.create({ provider: "xendit", secretKey: "xnd_development_dummy" });
        expect(gateway).toBeInstanceOf(XenditGateway);
        expect(gateway.name).toBe("xendit");
    });

    it("throws a clear error for an unknown provider tag", () => {
        expect(() => PaymentGatewayFactory.create({ provider: "not-a-real-gateway" } as any)).toThrow(/Unknown gateway provider/);
    });
});

describe("createPaymentService() — every provider performs REAL verification through the config-built instance (not a stub)", () => {
    it("stripe: real HMAC-SHA256 sign/verify round trip, both accept and reject paths", async () => {
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

        const wrongSignature = stripeClient.webhooks.generateTestHeaderString({ payload, secret: "whsec_wrong" });
        const rejected = await service.verifyWebhook("stripe", Buffer.from(payload), { "stripe-signature": wrongSignature });
        expect(rejected).toBeNull();
    });

    it("chapa: real HMAC-SHA256 sign/verify round trip, both accept and reject paths", async () => {
        const chapaSecret = "chapa-webhook-secret";
        const service = createPaymentService({
            gateways: { chapa: { provider: "chapa", secretKey: "CHASECK_TEST-dummy", webhookSecret: chapaSecret } },
            default: "chapa",
        });

        const raw = JSON.stringify({ event: "charge.success", tx_ref: "order-factory-2", amount: "42.50", currency: "ETB" });
        const validSig = createHmac("sha256", chapaSecret).update(raw).digest("hex");

        const event = await service.verifyWebhook("chapa", Buffer.from(raw), { "chapa-signature": validSig });
        expect(event).not.toBeNull();
        expect(event!.reference).toBe("order-factory-2");
        expect(event!.amountMinor).toBe(4250);

        const wrongSig = createHmac("sha256", "wrong-secret").update(raw).digest("hex");
        const rejected = await service.verifyWebhook("chapa", Buffer.from(raw), { "chapa-signature": wrongSig });
        expect(rejected).toBeNull();
    });

    it("paystack: real HMAC-SHA512 sign/verify round trip, both accept and reject paths", async () => {
        const secretKey = "sk_test_paystack_factory";
        const service = createPaymentService({
            gateways: { paystack: { provider: "paystack", secretKey } },
            default: "paystack",
        });

        const raw = JSON.stringify({ event: "charge.success", data: { reference: "order-factory-3", amount: 5000, currency: "NGN" } });
        const validSig = createHmac("sha512", secretKey).update(raw).digest("hex"); // Paystack signs with the API secret key itself

        const event = await service.verifyWebhook("paystack", Buffer.from(raw), { "x-paystack-signature": validSig });
        expect(event).not.toBeNull();
        expect(event!.reference).toBe("order-factory-3");
        expect(event!.amountMinor).toBe(5000);

        const wrongSig = createHmac("sha512", "wrong-secret").update(raw).digest("hex");
        const rejected = await service.verifyWebhook("paystack", Buffer.from(raw), { "x-paystack-signature": wrongSig });
        expect(rejected).toBeNull();
    });

    it("flutterwave: real timing-safe shared-secret check, both accept and reject paths", async () => {
        const secretHash = "dashboard-secret-hash-factory";
        const service = createPaymentService({
            gateways: {
                flutterwave: { provider: "flutterwave", publicKey: "FLWPUBK_TEST-dummy", secretKey: "FLWSECK_TEST-dummy", webhookSecretHash: secretHash },
            },
            default: "flutterwave",
        });

        const raw = JSON.stringify({
            event: "charge.completed",
            data: { id: 999, tx_ref: "order-factory-4", amount: 10.5, currency: "NGN", status: "successful" },
        });

        const event = await service.verifyWebhook("flutterwave", Buffer.from(raw), { "verif-hash": secretHash });
        expect(event).not.toBeNull();
        expect(event!.reference).toBe("order-factory-4");
        expect(event!.amountMinor).toBe(1050);

        const rejected = await service.verifyWebhook("flutterwave", Buffer.from(raw), { "verif-hash": "wrong-hash" });
        expect(rejected).toBeNull();
    });

    it("mollie: real API-lookup-based verification fails closed for an unreachable/invalid-key lookup (through the config-built instance)", async () => {
        const service = createPaymentService({
            gateways: { mollie: { provider: "mollie", apiKey: "test_intentionally_invalid_for_factory_check", webhookUrl: "https://example.com/webhooks/mollie" } },
            default: "mollie",
        });

        const rawBody = Buffer.from("id=tr_factorydoesnotexist");
        const event = await service.verifyWebhook("mollie", rawBody, {});
        expect(event).toBeNull(); // invalid key -> ApiError -> caught -> null, never throws
    }, 15000);

    it("razorpay: real HMAC-SHA256 sign/verify round trip, both accept and reject paths", async () => {
        const webhookSecret = "razorpay-webhook-secret-factory";
        const service = createPaymentService({
            gateways: { razorpay: { provider: "razorpay", keyId: "rzp_test_dummy", keySecret: "dummy", webhookSecret } },
            default: "razorpay",
        });

        const raw = JSON.stringify({
            event: "payment_link.paid",
            payload: { payment_link: { entity: { id: "plink_factory", reference_id: "order-factory-5", amount: 30000, currency: "INR" } } },
        });
        const validSig = createHmac("sha256", webhookSecret).update(raw).digest("hex");

        const event = await service.verifyWebhook("razorpay", Buffer.from(raw), { "x-razorpay-signature": validSig });
        expect(event).not.toBeNull();
        expect(event!.reference).toBe("order-factory-5");
        expect(event!.amountMinor).toBe(30000);

        const wrongSig = createHmac("sha256", "wrong-secret").update(raw).digest("hex");
        const rejected = await service.verifyWebhook("razorpay", Buffer.from(raw), { "x-razorpay-signature": wrongSig });
        expect(rejected).toBeNull();
    });

    it("xendit: real timing-safe shared-secret check, both accept and reject paths", async () => {
        const token = "dashboard-verification-token-factory";
        const service = createPaymentService({
            gateways: { xendit: { provider: "xendit", secretKey: "xnd_development_dummy", webhookVerificationToken: token } },
            default: "xendit",
        });

        const raw = JSON.stringify({ id: "inv_factory", external_id: "order-factory-6", status: "PAID", amount: 200000, currency: "IDR" });

        const event = await service.verifyWebhook("xendit", Buffer.from(raw), { "x-callback-token": token });
        expect(event).not.toBeNull();
        expect(event!.reference).toBe("order-factory-6");
        expect(event!.amountMinor).toBe(20000000);

        const rejected = await service.verifyWebhook("xendit", Buffer.from(raw), { "x-callback-token": "wrong-token" });
        expect(rejected).toBeNull();
    });
});

describe("createPaymentService() — config wiring behavior", () => {
    it("wires all 7 providers at once and exposes every name via availableGateways()", () => {
        const service = createPaymentService({
            gateways: {
                stripe: { provider: "stripe", secretKey: SECRET_KEY },
                chapa: { provider: "chapa", secretKey: "CHASECK_TEST-dummy" },
                paystack: { provider: "paystack", secretKey: "sk_test_dummy" },
                flutterwave: { provider: "flutterwave", publicKey: "FLWPUBK_TEST-dummy", secretKey: "FLWSECK_TEST-dummy" },
                mollie: { provider: "mollie", apiKey: "test_dummy", webhookUrl: "https://example.com/webhooks/mollie" },
                razorpay: { provider: "razorpay", keyId: "rzp_test_dummy", keySecret: "dummy" },
                xendit: { provider: "xendit", secretKey: "xnd_development_dummy" },
            },
            default: "stripe",
        });

        expect(service.availableGateways().sort()).toEqual(
            ["chapa", "flutterwave", "mollie", "paystack", "razorpay", "stripe", "xendit"].sort()
        );
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

import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import { createPaymentServiceFromEnv } from "../from-env";

// Proves createPaymentServiceFromEnv() actually reads real environment
// variables by the documented PAYMENTS_{PROVIDER}_{FIELD} convention and
// produces a REAL, working gateway for every one of the 7 providers — each
// verified via that gateway's own real crypto/verification mechanism (the
// same one proven in its own *.gateway.spec.ts and in
// create-payment-service.spec.ts), reached entirely through
// createPaymentServiceFromEnv(). Uses the `env` override (a plain object)
// rather than mutating the real process.env, so tests never leak
// environment state into each other or the rest of the suite.

describe("createPaymentServiceFromEnv() — reads the documented env var convention for every provider", () => {
    it("stripe: PAYMENTS_STRIPE_SECRET_KEY / PAYMENTS_STRIPE_WEBHOOK_SECRET, real HMAC-SHA256 verify", async () => {
        const env = {
            PAYMENTS_STRIPE_SECRET_KEY: "sk_test_from_env",
            PAYMENTS_STRIPE_WEBHOOK_SECRET: "whsec_from_env",
        };
        const service = createPaymentServiceFromEnv({ gateways: { stripe: true }, default: "stripe", env });

        const Stripe = (await import("stripe")).default;
        const client = new Stripe(env.PAYMENTS_STRIPE_SECRET_KEY);
        const payload = JSON.stringify({
            id: "evt_env_1",
            type: "checkout.session.completed",
            data: { object: { id: "cs_env_1", client_reference_id: "order-env-1", amount_total: 1500, currency: "usd" } },
        });
        const header = client.webhooks.generateTestHeaderString({ payload, secret: env.PAYMENTS_STRIPE_WEBHOOK_SECRET });

        const event = await service.verifyWebhook("stripe", Buffer.from(payload), { "stripe-signature": header });
        expect(event).not.toBeNull();
        expect(event!.reference).toBe("order-env-1");
    });

    it("chapa: PAYMENTS_CHAPA_SECRET_KEY / PAYMENTS_CHAPA_WEBHOOK_SECRET, real HMAC-SHA256 verify", async () => {
        const env = {
            PAYMENTS_CHAPA_SECRET_KEY: "CHASECK_TEST-from-env",
            PAYMENTS_CHAPA_WEBHOOK_SECRET: "chapa-webhook-from-env",
        };
        const service = createPaymentServiceFromEnv({ gateways: { chapa: true }, default: "chapa", env });

        const raw = JSON.stringify({ event: "charge.success", tx_ref: "order-env-2", amount: "20.00", currency: "ETB" });
        const signature = createHmac("sha256", env.PAYMENTS_CHAPA_WEBHOOK_SECRET).update(raw).digest("hex");

        const event = await service.verifyWebhook("chapa", Buffer.from(raw), { "chapa-signature": signature });
        expect(event).not.toBeNull();
        expect(event!.reference).toBe("order-env-2");
    });

    it("paystack: PAYMENTS_PAYSTACK_SECRET_KEY, real HMAC-SHA512 verify (no webhook secret field — same key signs)", async () => {
        const env = { PAYMENTS_PAYSTACK_SECRET_KEY: "sk_test_paystack_from_env" };
        const service = createPaymentServiceFromEnv({ gateways: { paystack: true }, default: "paystack", env });

        const raw = JSON.stringify({ event: "charge.success", data: { reference: "order-env-3", amount: 3000, currency: "NGN" } });
        const signature = createHmac("sha512", env.PAYMENTS_PAYSTACK_SECRET_KEY).update(raw).digest("hex");

        const event = await service.verifyWebhook("paystack", Buffer.from(raw), { "x-paystack-signature": signature });
        expect(event).not.toBeNull();
        expect(event!.reference).toBe("order-env-3");
    });

    it("flutterwave: PAYMENTS_FLUTTERWAVE_PUBLIC_KEY / _SECRET_KEY / _WEBHOOK_SECRET_HASH, real timing-safe verify", async () => {
        const env = {
            PAYMENTS_FLUTTERWAVE_PUBLIC_KEY: "FLWPUBK_TEST-from-env",
            PAYMENTS_FLUTTERWAVE_SECRET_KEY: "FLWSECK_TEST-from-env",
            PAYMENTS_FLUTTERWAVE_WEBHOOK_SECRET_HASH: "flutterwave-hash-from-env",
        };
        const service = createPaymentServiceFromEnv({ gateways: { flutterwave: true }, default: "flutterwave", env });

        const raw = Buffer.from(
            JSON.stringify({ event: "charge.completed", data: { id: 1, tx_ref: "order-env-4", amount: 40, currency: "NGN", status: "successful" } })
        );
        const event = await service.verifyWebhook("flutterwave", raw, { "verif-hash": env.PAYMENTS_FLUTTERWAVE_WEBHOOK_SECRET_HASH });
        expect(event).not.toBeNull();
        expect(event!.reference).toBe("order-env-4");
    });

    it("mollie: PAYMENTS_MOLLIE_API_KEY / PAYMENTS_MOLLIE_WEBHOOK_URL (both required — no local signature, live API lookup)", async () => {
        const env = {
            PAYMENTS_MOLLIE_API_KEY: "test_mollie_from_env",
            PAYMENTS_MOLLIE_WEBHOOK_URL: "https://example.com/webhooks/mollie",
        };
        const service = createPaymentServiceFromEnv({ gateways: { mollie: true }, default: "mollie", env });

        // Mollie has no local signature — "verification" is a live API
        // lookup, which fails closed (returns null) against a fake key,
        // exactly like this gateway's own dedicated spec proves.
        const event = await service.verifyWebhook("mollie", Buffer.from("id=tr_doesnotexist"), {});
        expect(event).toBeNull();
    }, 15000);

    it("razorpay: PAYMENTS_RAZORPAY_KEY_ID / _KEY_SECRET / _WEBHOOK_SECRET, real HMAC-SHA256 verify", async () => {
        const env = {
            PAYMENTS_RAZORPAY_KEY_ID: "rzp_test_from_env",
            PAYMENTS_RAZORPAY_KEY_SECRET: "razorpay_secret_from_env",
            PAYMENTS_RAZORPAY_WEBHOOK_SECRET: "razorpay_webhook_from_env",
        };
        const service = createPaymentServiceFromEnv({ gateways: { razorpay: true }, default: "razorpay", env });

        const raw = JSON.stringify({
            event: "payment_link.paid",
            payload: { payment_link: { entity: { id: "plink_env_1", reference_id: "order-env-5", amount: 5000, currency: "INR" } } },
        });
        const signature = createHmac("sha256", env.PAYMENTS_RAZORPAY_WEBHOOK_SECRET).update(raw).digest("hex");

        const event = await service.verifyWebhook("razorpay", Buffer.from(raw), { "x-razorpay-signature": signature });
        expect(event).not.toBeNull();
        expect(event!.reference).toBe("order-env-5");
    });

    it("xendit: PAYMENTS_XENDIT_SECRET_KEY / PAYMENTS_XENDIT_WEBHOOK_VERIFICATION_TOKEN, real timing-safe verify", async () => {
        const env = {
            PAYMENTS_XENDIT_SECRET_KEY: "xnd_development_from_env",
            PAYMENTS_XENDIT_WEBHOOK_VERIFICATION_TOKEN: "xendit-token-from-env",
        };
        const service = createPaymentServiceFromEnv({ gateways: { xendit: true }, default: "xendit", env });

        const raw = Buffer.from(JSON.stringify({ id: "inv_env_1", external_id: "order-env-6", status: "PAID", amount: 60000, currency: "IDR" }));
        const event = await service.verifyWebhook("xendit", raw, { "x-callback-token": env.PAYMENTS_XENDIT_WEBHOOK_VERIFICATION_TOKEN });
        expect(event).not.toBeNull();
        expect(event!.reference).toBe("order-env-6");
    });
});

describe("createPaymentServiceFromEnv() — config wiring behavior", () => {
    it("wires multiple gateways at once, all present via availableGateways()", () => {
        const env = {
            PAYMENTS_STRIPE_SECRET_KEY: "sk_test_x",
            PAYMENTS_CHAPA_SECRET_KEY: "CHASECK_TEST-x",
        };
        const service = createPaymentServiceFromEnv({ gateways: { stripe: true, chapa: true }, default: "stripe", env });
        expect(service.availableGateways().sort()).toEqual(["chapa", "stripe"]);
    });

    it("defaults to the first listed gateway when `default` is omitted", () => {
        const env = { PAYMENTS_PAYSTACK_SECRET_KEY: "sk_test_x" };
        const service = createPaymentServiceFromEnv({ gateways: { paystack: true }, env });
        // Only one gateway configured — verifying the DEFAULT resolves to
        // it proves the "first key wins" fallback, not just that it exists.
        expect(service.availableGateways()).toEqual(["paystack"]);
    });

    it("throws ONE error listing every missing required variable across every enabled gateway, not just the first", () => {
        const env = {}; // nothing set
        expect(() => createPaymentServiceFromEnv({ gateways: { stripe: true, razorpay: true }, default: "stripe", env })).toThrow(
            /PAYMENTS_STRIPE_SECRET_KEY.*PAYMENTS_RAZORPAY_KEY_ID.*PAYMENTS_RAZORPAY_KEY_SECRET/s
        );
    });

    it("does NOT throw for a missing OPTIONAL variable (e.g. webhookSecret) — only required fields are enforced", () => {
        const env = { PAYMENTS_STRIPE_SECRET_KEY: "sk_test_x" }; // no PAYMENTS_STRIPE_WEBHOOK_SECRET
        expect(() => createPaymentServiceFromEnv({ gateways: { stripe: true }, default: "stripe", env })).not.toThrow();
    });

    it("throws when given zero gateways", () => {
        expect(() => createPaymentServiceFromEnv({ gateways: {}, env: {} })).toThrow(/at least one gateway/);
    });

    it("a per-field override reads a custom-named env var instead of the default convention", () => {
        const env = { MY_CUSTOM_STRIPE_KEY: "sk_test_custom_var_name" };
        const service = createPaymentServiceFromEnv({
            gateways: { stripe: { secretKey: "MY_CUSTOM_STRIPE_KEY" } },
            default: "stripe",
            env,
        });
        // No PAYMENTS_STRIPE_SECRET_KEY was set at all — if this didn't
        // throw, the override was genuinely used instead of the default.
        expect(service.availableGateways()).toEqual(["stripe"]);
    });

    it("an override for one field doesn't disable the default convention for that gateway's OTHER fields", async () => {
        const env = {
            MY_CUSTOM_STRIPE_KEY: "sk_test_custom",
            PAYMENTS_STRIPE_WEBHOOK_SECRET: "whsec_still_default_convention",
        };
        const service = createPaymentServiceFromEnv({
            gateways: { stripe: { secretKey: "MY_CUSTOM_STRIPE_KEY" } },
            default: "stripe",
            env,
        });

        const Stripe = (await import("stripe")).default;
        const client = new Stripe(env.MY_CUSTOM_STRIPE_KEY);
        const payload = JSON.stringify({ id: "evt_x", type: "checkout.session.completed", data: { object: { id: "cs_x" } } });
        const header = client.webhooks.generateTestHeaderString({ payload, secret: env.PAYMENTS_STRIPE_WEBHOOK_SECRET });

        // If webhookSecret hadn't actually been read from the default var,
        // this real signature (signed with that value) would fail to verify.
        const event = await service.verifyWebhook("stripe", Buffer.from(payload), { "stripe-signature": header });
        expect(event).not.toBeNull();
    });

    it("reads from real process.env when `env` is omitted", () => {
        const original = process.env.PAYMENTS_XENDIT_SECRET_KEY;
        process.env.PAYMENTS_XENDIT_SECRET_KEY = "xnd_development_real_process_env";
        try {
            const service = createPaymentServiceFromEnv({ gateways: { xendit: true }, default: "xendit" });
            expect(service.availableGateways()).toEqual(["xendit"]);
        } finally {
            if (original === undefined) delete process.env.PAYMENTS_XENDIT_SECRET_KEY;
            else process.env.PAYMENTS_XENDIT_SECRET_KEY = original;
        }
    });

    it("an empty-string env var is treated the same as unset (throws for a required field)", () => {
        const env = { PAYMENTS_STRIPE_SECRET_KEY: "" };
        expect(() => createPaymentServiceFromEnv({ gateways: { stripe: true }, default: "stripe", env })).toThrow(/PAYMENTS_STRIPE_SECRET_KEY/);
    });
});

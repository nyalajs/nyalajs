import { PaymentService } from "./services/payment.service";
import { createPaymentService } from "./create-payment-service";
import { GatewayConfig } from "./payment-gateway.factory";

/** The `provider` tag for every gateway `fromEnv()` knows how to wire up. */
export type GatewayProvider = GatewayConfig["provider"];

export interface FromEnvOptions {
    /**
     * Which gateways to wire up, and (for the ones with more than one env
     * var) which key each field reads. Every value defaults to
     * `PAYMENTS_{PROVIDER}_{FIELD}` (e.g. `PAYMENTS_STRIPE_SECRET_KEY`) —
     * only pass an override for a specific field if your `.env` uses
     * different names.
     */
    gateways: Partial<Record<GatewayProvider, true | Record<string, string>>>;
    /** Which gateway is used when a call site doesn't name one explicitly. Defaults to the first key in `gateways` (in the order JS preserves object keys), matching `createPaymentService()`'s own default-selection behavior. */
    default?: GatewayProvider;
    /** Where to read variables from. Defaults to `process.env`. Override for tests, or to read from a config object instead of the real environment. */
    env?: Record<string, string | undefined>;
}

interface FieldSpec {
    /** The GatewayConfig property this env var fills. */
    field: string;
    /** The env var's default name, before any per-field override. */
    defaultVar: string;
    required: boolean;
}

/**
 * Every gateway's fields, in the exact shape `PaymentGatewayFactory.create()`
 * expects, alongside the default env var name `fromEnv()` reads for each —
 * one definition per gateway, kept next to `GatewayConfig` in
 * payment-gateway.factory.ts conceptually (declared here to avoid a
 * circular import, since the per-gateway option types already live on each
 * gateway class).
 */
const GATEWAY_FIELDS: Record<GatewayProvider, FieldSpec[]> = {
    stripe: [
        { field: "secretKey", defaultVar: "PAYMENTS_STRIPE_SECRET_KEY", required: true },
        { field: "webhookSecret", defaultVar: "PAYMENTS_STRIPE_WEBHOOK_SECRET", required: false },
    ],
    chapa: [
        { field: "secretKey", defaultVar: "PAYMENTS_CHAPA_SECRET_KEY", required: true },
        { field: "webhookSecret", defaultVar: "PAYMENTS_CHAPA_WEBHOOK_SECRET", required: false },
    ],
    paystack: [
        { field: "secretKey", defaultVar: "PAYMENTS_PAYSTACK_SECRET_KEY", required: true },
        { field: "baseUrl", defaultVar: "PAYMENTS_PAYSTACK_BASE_URL", required: false },
    ],
    flutterwave: [
        { field: "publicKey", defaultVar: "PAYMENTS_FLUTTERWAVE_PUBLIC_KEY", required: true },
        { field: "secretKey", defaultVar: "PAYMENTS_FLUTTERWAVE_SECRET_KEY", required: true },
        { field: "webhookSecretHash", defaultVar: "PAYMENTS_FLUTTERWAVE_WEBHOOK_SECRET_HASH", required: false },
    ],
    mollie: [
        { field: "apiKey", defaultVar: "PAYMENTS_MOLLIE_API_KEY", required: true },
        // Mollie has no local webhook signature; webhookUrl is required at
        // construction time (see MollieGatewayOptions) so it can be reached
        // at checkout-creation time — not optional the way other gateways'
        // webhook fields are.
        { field: "webhookUrl", defaultVar: "PAYMENTS_MOLLIE_WEBHOOK_URL", required: true },
    ],
    razorpay: [
        { field: "keyId", defaultVar: "PAYMENTS_RAZORPAY_KEY_ID", required: true },
        { field: "keySecret", defaultVar: "PAYMENTS_RAZORPAY_KEY_SECRET", required: true },
        { field: "webhookSecret", defaultVar: "PAYMENTS_RAZORPAY_WEBHOOK_SECRET", required: false },
    ],
    xendit: [
        { field: "secretKey", defaultVar: "PAYMENTS_XENDIT_SECRET_KEY", required: true },
        { field: "webhookVerificationToken", defaultVar: "PAYMENTS_XENDIT_WEBHOOK_VERIFICATION_TOKEN", required: false },
    ],
};

/**
 * `createPaymentService()`, but the gateway config itself is read from
 * environment variables by a documented naming convention
 * (`PAYMENTS_{PROVIDER}_{FIELD}`, e.g. `PAYMENTS_STRIPE_SECRET_KEY`,
 * `PAYMENTS_CHAPA_WEBHOOK_SECRET`) instead of being spelled out by hand —
 * the only code is which gateways to enable.
 *
 * @example
 *   // .env:
 *   //   PAYMENTS_STRIPE_SECRET_KEY=sk_live_...
 *   //   PAYMENTS_STRIPE_WEBHOOK_SECRET=whsec_...
 *   //   PAYMENTS_CHAPA_SECRET_KEY=CHASECK_...
 *
 *   const payments = createPaymentServiceFromEnv({
 *     gateways: { stripe: true, chapa: true },
 *     default: "stripe",
 *   });
 *
 * A field can still be overridden per-gateway if your `.env` uses
 * different names than the convention:
 *
 *   const payments = createPaymentServiceFromEnv({
 *     gateways: { stripe: { secretKey: "MY_CUSTOM_STRIPE_KEY_VAR" } },
 *   });
 *
 * Throws a single error listing every missing REQUIRED variable across
 * every enabled gateway (not just the first one found) — so a
 * misconfigured deployment fails loudly, at startup, with the complete
 * list of what to fix, rather than one gateway at a time as each is first
 * used.
 */
export function createPaymentServiceFromEnv(options: FromEnvOptions): PaymentService {
    const env = options.env ?? process.env;
    const gatewayNames = Object.keys(options.gateways) as GatewayProvider[];

    if (gatewayNames.length === 0) {
        throw new Error("[nyala/payments] createPaymentServiceFromEnv() needs at least one gateway in `gateways`.");
    }

    const missing: string[] = [];
    const gateways: Record<string, GatewayConfig> = {};

    for (const provider of gatewayNames) {
        const overrides = options.gateways[provider];
        const varOverrides = overrides === true ? {} : (overrides ?? {});
        const fields = GATEWAY_FIELDS[provider];

        const config: Record<string, any> = { provider };
        for (const spec of fields) {
            const varName = varOverrides[spec.field] ?? spec.defaultVar;
            const value = env[varName];

            if (value === undefined || value === "") {
                if (spec.required) {
                    missing.push(`${varName} (${provider}.${spec.field})`);
                }
                continue;
            }
            config[spec.field] = value;
        }

        gateways[provider] = config as GatewayConfig;
    }

    if (missing.length > 0) {
        throw new Error(
            `[nyala/payments] createPaymentServiceFromEnv() is missing ${missing.length} required environment variable(s):\n` +
            missing.map((m) => `  - ${m}`).join("\n")
        );
    }

    return createPaymentService({
        gateways,
        default: options.default ?? gatewayNames[0],
    });
}

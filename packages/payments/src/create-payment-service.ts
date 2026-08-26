import { PaymentService } from "./services/payment.service";
import { PaymentGatewayFactory, GatewayConfig } from "./payment-gateway.factory";

export interface CreatePaymentServiceOptions {
    /** Every gateway your app accepts payments through, keyed by whatever name you want to call it in `createCheckout(options, gatewayName)`. Each entry's `provider` selects the real adapter — the key and the provider don't have to match (e.g. `{ primary: { provider: "stripe", ... } }`). */
    gateways: Record<string, GatewayConfig>;
    /** Which key in `gateways` is used when a call site doesn't name one explicitly. */
    default: string;
}

/**
 * The one-call setup path — takes plain config (env vars in, gateways out)
 * and returns a fully wired PaymentService, without touching any gateway
 * class directly. This is the intended default entry point; construct
 * PaymentService yourself only if you need something this can't express
 * (e.g. a gateway instance built by hand for a custom subclass).
 *
 * @example
 *   const payments = createPaymentService({
 *     gateways: {
 *       stripe: { provider: "stripe", secretKey: env.STRIPE_SECRET_KEY, webhookSecret: env.STRIPE_WEBHOOK_SECRET },
 *       chapa: { provider: "chapa", secretKey: env.CHAPA_SECRET_KEY, webhookSecret: env.CHAPA_WEBHOOK_SECRET },
 *     },
 *     default: "stripe",
 *   });
 *
 *   const session = await payments.createCheckout({ ... });        // uses "stripe"
 *   const session2 = await payments.createCheckout({ ... }, "chapa"); // explicit
 */
export function createPaymentService(options: CreatePaymentServiceOptions): PaymentService {
    const gateways: Record<string, ReturnType<typeof PaymentGatewayFactory.create>> = {};
    for (const [name, config] of Object.entries(options.gateways)) {
        gateways[name] = PaymentGatewayFactory.create(config);
    }
    return new PaymentService(gateways, { default: options.default });
}

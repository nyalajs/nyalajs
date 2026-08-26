import { PaymentGateway } from "./gateway.interface";
import { StripeGateway, StripeGatewayOptions } from "./gateways/stripe/stripe.gateway";
import { ChapaGateway, ChapaGatewayOptions } from "./gateways/chapa/chapa.gateway";
import { PaystackGateway, PaystackGatewayOptions } from "./gateways/paystack/paystack.gateway";
import { FlutterwaveGateway, FlutterwaveGatewayOptions } from "./gateways/flutterwave/flutterwave.gateway";
import { MollieGateway, MollieGatewayOptions } from "./gateways/mollie/mollie.gateway";
import { RazorpayGateway, RazorpayGatewayOptions } from "./gateways/razorpay/razorpay.gateway";
import { XenditGateway, XenditGatewayOptions } from "./gateways/xendit/xendit.gateway";

export type GatewayConfig =
    | ({ provider: "stripe" } & StripeGatewayOptions)
    | ({ provider: "chapa" } & ChapaGatewayOptions)
    | ({ provider: "paystack" } & PaystackGatewayOptions)
    | ({ provider: "flutterwave" } & FlutterwaveGatewayOptions)
    | ({ provider: "mollie" } & MollieGatewayOptions)
    | ({ provider: "razorpay" } & RazorpayGatewayOptions)
    | ({ provider: "xendit" } & XenditGatewayOptions);

/**
 * Builds one PaymentGateway from a plain config object — mirrors
 * @nyalajs/microservices' ClientProxyFactory (one factory, a `provider`/
 * `transport` tag selects the concrete class) so wiring up a gateway is a
 * config object, not `new StripeGateway(...)` scattered through app code.
 *
 * @example
 *   const gateway = PaymentGatewayFactory.create({
 *     provider: "stripe",
 *     secretKey: env.STRIPE_SECRET_KEY,
 *     webhookSecret: env.STRIPE_WEBHOOK_SECRET,
 *   });
 */
export class PaymentGatewayFactory {
    static create(config: GatewayConfig): PaymentGateway {
        switch (config.provider) {
            case "stripe":
                return new StripeGateway(config);
            case "chapa":
                return new ChapaGateway(config);
            case "paystack":
                return new PaystackGateway(config);
            case "flutterwave":
                return new FlutterwaveGateway(config);
            case "mollie":
                return new MollieGateway(config);
            case "razorpay":
                return new RazorpayGateway(config);
            case "xendit":
                return new XenditGateway(config);
            default:
                throw new Error(`[nyala/payments] Unknown gateway provider: "${(config as GatewayConfig).provider}"`);
        }
    }
}

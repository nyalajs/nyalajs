import { Injectable } from "@nyalajs/core";
import { PaymentGateway, CreateCheckoutOptions, CheckoutSession, PaymentEvent, RefundResult } from "../gateway.interface";

export interface PaymentServiceOptions {
    /** The gateway used when createCheckout()/refund() are called without an explicit `gateway` name — your app's default/primary provider. */
    default: string;
}

/**
 * DI-wired entry point over one or more registered PaymentGateway
 * instances — mirrors @nyalajs/microservices' ClientProxyFactory pattern
 * (one call site, gateway selection by name/config, not by importing a
 * specific adapter class everywhere). Register one PaymentService per app,
 * with every gateway you accept payments through.
 *
 * @example
 *   const service = new PaymentService(
 *     { stripe: new StripeGateway({...}), chapa: new ChapaGateway({...}) },
 *     { default: "stripe" }
 *   );
 *   await service.createCheckout({ ... }); // uses "stripe"
 *   await service.createCheckout({ ... }, "chapa"); // explicit override
 */
@Injectable()
export class PaymentService {
    constructor(
        private readonly gateways: Record<string, PaymentGateway>,
        private readonly options: PaymentServiceOptions
    ) {
        if (!gateways[options.default]) {
            throw new Error(
                `[nyala/payments] PaymentServiceOptions.default ("${options.default}") has no matching entry in the gateways map. Registered gateways: ${Object.keys(gateways).join(", ") || "(none)"}`
            );
        }
    }

    /** The gateway names this service knows about — useful for a "pay with..." selector in your UI. */
    availableGateways(): string[] {
        return Object.keys(this.gateways);
    }

    createCheckout(options: CreateCheckoutOptions, gatewayName?: string): Promise<CheckoutSession> {
        return this.resolve(gatewayName).createCheckout(options);
    }

    /**
     * Verifies and normalizes an incoming webhook against a SPECIFIC named
     * gateway — unlike createCheckout()/refund(), there's no "default" here:
     * a webhook route is inherently gateway-specific (each gateway posts to
     * its own URL), so the caller (see webhooks/mount-webhook-route.ts)
     * always knows exactly which gateway's verifyWebhook() to invoke.
     */
    verifyWebhook(gatewayName: string, rawBody: Buffer, headers: Record<string, string | string[] | undefined>): Promise<PaymentEvent | null> {
        return this.resolve(gatewayName).verifyWebhook(rawBody, headers);
    }

    refund(gatewayReference: string, amountMinor?: number, gatewayName?: string): Promise<RefundResult> {
        return this.resolve(gatewayName).refund(gatewayReference, amountMinor);
    }

    /** The raw, gateway-specific client (e.g. the real Stripe SDK instance) for anything the normalized interface doesn't cover. */
    getRawClient(gatewayName?: string): unknown {
        return (this.resolve(gatewayName) as any).client;
    }

    private resolve(gatewayName?: string): PaymentGateway {
        const name = gatewayName ?? this.options.default;
        const gateway = this.gateways[name];
        if (!gateway) {
            throw new Error(
                `[nyala/payments] No gateway registered under the name "${name}". Registered gateways: ${Object.keys(this.gateways).join(", ") || "(none)"}`
            );
        }
        return gateway;
    }
}

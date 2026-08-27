import {
    PaymentGateway,
    CreateCheckoutOptions,
    CheckoutSession,
    PaymentEvent,
    RefundResult,
} from "../../gateway.interface";
import { resolveAmount } from "../../resolve-amount";

export interface StripeGatewayOptions {
    secretKey: string;
    /** Your Stripe webhook endpoint's signing secret (whsec_...), from the Dashboard or `stripe listen`. Required for verifyWebhook() to do anything — omit only if you'll never call it. */
    webhookSecret?: string;
}

/**
 * International/US/Europe baseline. Uses Stripe Checkout (hosted redirect)
 * — card data never touches your server. Webhook verification uses
 * Stripe's own HMAC-SHA256 signature scheme via the `Stripe-Signature`
 * header (timestamped, `t=...,v1=...` format) — see
 * https://docs.stripe.com/webhooks/signature.
 */
export class StripeGateway implements PaymentGateway {
    readonly name = "stripe";

    /** The real Stripe SDK client, for anything the normalized interface doesn't cover. */
    public readonly client: any;

    constructor(private readonly options: StripeGatewayOptions) {
        // Lazy require so `stripe` stays an optional peer dependency — only
        // apps that actually use StripeGateway need it installed.
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const Stripe = require("stripe");
        this.client = new Stripe(options.secretKey);
    }

    async createCheckout(options: CreateCheckoutOptions): Promise<CheckoutSession> {
        // Stripe Checkout wants per-line-item unit_amount fields, not a
        // single collapsed total the way every other gateway in this
        // package does — so the computed total itself is discarded here,
        // but resolveAmount() still runs for its validation (presence,
        // lineItems/amountMinor agreement, and — the actual reason this
        // call exists — rejecting a negative/zero/non-integer amount
        // before it ever reaches Stripe's API).
        resolveAmount(options);

        const lineItems = options.lineItems
            ? options.lineItems.map((item) => ({
                  price_data: {
                      currency: options.currency.toLowerCase(),
                      product_data: { name: item.name },
                      unit_amount: item.amountMinor,
                  },
                  quantity: item.quantity ?? 1,
              }))
            : [
                  {
                      price_data: {
                          currency: options.currency.toLowerCase(),
                          product_data: { name: options.reference },
                          unit_amount: options.amountMinor!,
                      },
                      quantity: 1,
                  },
              ];

        const session = await this.client.checkout.sessions.create({
            mode: "payment",
            line_items: lineItems,
            success_url: options.successUrl,
            cancel_url: options.cancelUrl,
            client_reference_id: options.reference,
            customer_email: options.customerEmail,
            metadata: options.metadata,
        });

        if (!session.url) {
            throw new Error("[nyala/payments] Stripe returned a checkout session with no URL — unexpected API response shape.");
        }

        return { gatewayReference: session.id, checkoutUrl: session.url, gateway: this.name };
    }

    async verifyWebhook(rawBody: Buffer, headers: Record<string, string | string[] | undefined>): Promise<PaymentEvent | null> {
        if (!this.options.webhookSecret) {
            throw new Error(
                "[nyala/payments] StripeGateway.verifyWebhook() called but no webhookSecret was configured — pass one to StripeGateway's constructor."
            );
        }

        const signatureHeader = headers["stripe-signature"];
        if (!signatureHeader || Array.isArray(signatureHeader)) return null;

        let event: any;
        try {
            event = await this.client.webhooks.constructEventAsync(rawBody, signatureHeader, this.options.webhookSecret);
        } catch {
            return null;
        }

        return this.normalizeEvent(event);
    }

    private normalizeEvent(event: any): PaymentEvent | null {
        const object = event.data?.object;
        if (!object) return null;

        const typeMap: Record<string, PaymentEvent["type"]> = {
            "checkout.session.completed": "payment.succeeded",
            "payment_intent.payment_failed": "payment.failed",
            "charge.refunded": "payment.refunded",
        };
        const type = typeMap[event.type];
        if (!type) return null; // an event kind this adapter doesn't normalize — caller ignores it

        return {
            type,
            reference: object.client_reference_id ?? object.metadata?.reference ?? "",
            gatewayReference: object.id,
            gateway: this.name,
            amountMinor: object.amount_total ?? object.amount ?? 0,
            currency: (object.currency ?? "usd").toUpperCase(),
            metadata: object.metadata ?? {},
            raw: event,
        };
    }

    async refund(gatewayReference: string, amountMinor?: number): Promise<RefundResult> {
        try {
            // gatewayReference here is expected to be a PaymentIntent or Charge id —
            // Checkout Sessions aren't directly refundable, so callers refunding a
            // checkout should pass the payment_intent id from the succeeded event's
            // raw payload (event.raw.data.object.payment_intent), not the session id.
            const refund = await this.client.refunds.create({
                payment_intent: gatewayReference,
                amount: amountMinor,
            });
            return refund.status === "succeeded"
                ? { status: "succeeded", gatewayRefundId: refund.id }
                : { status: "pending", gatewayRefundId: refund.id };
        } catch (err) {
            return { status: "failed", reason: err instanceof Error ? err.message : String(err) };
        }
    }
}

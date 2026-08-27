import { timingSafeEqual, createHmac } from "node:crypto";
import {
    PaymentGateway,
    CreateCheckoutOptions,
    CheckoutSession,
    PaymentEvent,
    RefundResult,
} from "../../gateway.interface";

export interface RazorpayGatewayOptions {
    keyId: string;
    keySecret: string;
    /** Your Razorpay webhook's signing secret, configured in the dashboard alongside the webhook URL. Required for verifyWebhook(). */
    webhookSecret?: string;
}

/**
 * India's dominant gateway — UPI (India's national instant payment rails)
 * is its standout feature, with no real equivalent in most other gateways
 * in this package. Hosted checkout uses Razorpay Payment Links (`short_url`)
 * rather than the Orders API + Checkout.js widget, since Payment Links are
 * the one Razorpay flow that fits this package's "return a URL to redirect
 * to" contract without needing frontend JS of your own.
 *
 * `customer.email` is required by Razorpay's Payment Links API (unlike
 * most other gateways here, where it's optional) — createCheckout() falls
 * back to a placeholder if none was given, same convention as Paystack.
 *
 * Webhook signature is HMAC-SHA256 (hex) via the `X-Razorpay-Signature`
 * header — verified here directly rather than through
 * `Razorpay.validateWebhookSignature()` so the comparison is timing-safe
 * (the SDK's own helper uses a plain `===` string comparison).
 */
export class RazorpayGateway implements PaymentGateway {
    readonly name = "razorpay";

    /** The real razorpay SDK client, for anything the normalized interface doesn't cover. */
    public readonly client: any;

    constructor(private readonly options: RazorpayGatewayOptions) {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const Razorpay = require("razorpay");
        this.client = new Razorpay({ key_id: options.keyId, key_secret: options.keySecret });
    }

    async createCheckout(options: CreateCheckoutOptions): Promise<CheckoutSession> {
        const amountMinor = this.resolveAmount(options);

        const paymentLink = await this.client.paymentLink.create({
            amount: amountMinor,
            currency: options.currency.toUpperCase(),
            reference_id: options.reference,
            description: options.reference,
            customer: { email: options.customerEmail ?? "no-email-provided@example.com" },
            notify: { email: !!options.customerEmail, sms: false },
            callback_url: options.successUrl,
            callback_method: "get",
            notes: options.metadata,
            // Razorpay Payment Links have exactly ONE redirect field
            // (callback_url, above) — confirmed against the SDK's own real
            // type definitions, no cancel/failure-redirect concept exists
            // in this API at all. options.cancelUrl is intentionally
            // unused here, same real limitation as ChapaGateway (see its
            // createCheckout() comment) — a cancelled/abandoned Payment
            // Link simply has nowhere else to send the customer.
        });

        if (!paymentLink.short_url) {
            throw new Error(`[nyala/payments] Razorpay did not return a short_url — response: ${JSON.stringify(paymentLink)}`);
        }

        return { gatewayReference: paymentLink.id, checkoutUrl: paymentLink.short_url, gateway: this.name };
    }

    async verifyWebhook(rawBody: Buffer, headers: Record<string, string | string[] | undefined>): Promise<PaymentEvent | null> {
        if (!this.options.webhookSecret) {
            throw new Error(
                "[nyala/payments] RazorpayGateway.verifyWebhook() called but no webhookSecret was configured — pass one to RazorpayGateway's constructor."
            );
        }

        const signature = this.firstHeader(headers["x-razorpay-signature"]);
        if (!signature) return null;

        const expected = createHmac("sha256", this.options.webhookSecret).update(rawBody).digest("hex");
        if (!this.timingSafeEqualHex(expected, signature)) return null;

        let payload: any;
        try {
            payload = JSON.parse(rawBody.toString("utf8"));
        } catch {
            return null;
        }

        return this.normalizeEvent(payload);
    }

    private normalizeEvent(payload: any): PaymentEvent | null {
        // Payment Links fire "payment_link.paid" (and "payment_link.expired" /
        // "payment_link.cancelled" for the failure paths); Orders/direct
        // Checkout.js integrations instead fire "payment.captured" /
        // "payment.failed" — both shapes are normalized here since a Nyala
        // app might combine Payment Links (this adapter's createCheckout())
        // with a direct/manual Checkout.js integration.
        const typeMap: Record<string, PaymentEvent["type"]> = {
            "payment_link.paid": "payment.succeeded",
            "payment_link.expired": "payment.failed",
            "payment_link.cancelled": "payment.failed",
            "payment.captured": "payment.succeeded",
            "payment.failed": "payment.failed",
            "refund.processed": "payment.refunded",
        };
        const type = typeMap[payload.event];
        if (!type) return null;

        const entity = payload.payload?.payment_link?.entity ?? payload.payload?.payment?.entity ?? {};
        return {
            type,
            reference: entity.reference_id ?? entity.notes?.reference ?? "",
            gatewayReference: entity.id ?? "",
            gateway: this.name,
            amountMinor: entity.amount ?? entity.amount_paid ?? 0,
            currency: (entity.currency ?? "INR").toUpperCase(),
            metadata: entity.notes ?? {},
            raw: payload,
        };
    }

    async refund(gatewayReference: string, amountMinor?: number): Promise<RefundResult> {
        try {
            const refund = await this.client.payments.refund(gatewayReference, amountMinor !== undefined ? { amount: amountMinor } : {});
            if (refund.status === "processed") {
                return { status: "succeeded", gatewayRefundId: refund.id };
            }
            return { status: "pending", gatewayRefundId: refund.id };
        } catch (err) {
            return { status: "failed", reason: this.extractErrorMessage(err) };
        }
    }

    /**
     * The razorpay SDK does NOT throw real Error instances — it rejects with
     * a plain object shaped like `{ statusCode, error: { code, description } }`
     * (confirmed directly against the real API). `err instanceof Error` is
     * therefore always false for these, so a naive `String(err)` fallback
     * collapses every failure into the useless "[object Object]". This pulls
     * the real message out of Razorpay's actual error shape first.
     */
    private extractErrorMessage(err: unknown): string {
        if (err instanceof Error) return err.message;
        if (err && typeof err === "object" && "error" in err) {
            const inner = (err as { error?: { description?: string } }).error;
            if (inner?.description) return inner.description;
        }
        if (err && typeof err === "object" && "statusCode" in err) {
            return `Razorpay request failed with status ${(err as { statusCode: unknown }).statusCode}`;
        }
        return String(err);
    }

    private resolveAmount(options: CreateCheckoutOptions): number {
        if (options.amountMinor !== undefined) return options.amountMinor;
        if (options.lineItems) {
            return options.lineItems.reduce((total, item) => total + item.amountMinor * (item.quantity ?? 1), 0);
        }
        throw new Error("[nyala/payments] createCheckout() needs either lineItems or amountMinor.");
    }

    private firstHeader(value: string | string[] | undefined): string | undefined {
        return Array.isArray(value) ? value[0] : value;
    }

    private timingSafeEqualHex(a: string, b: string): boolean {
        if (a.length !== b.length) return false;
        try {
            return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
        } catch {
            return false;
        }
    }
}

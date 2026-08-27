import { timingSafeEqual } from "node:crypto";
import {
    PaymentGateway,
    CreateCheckoutOptions,
    CheckoutSession,
    PaymentEvent,
    RefundResult,
} from "../../gateway.interface";
import { resolveAmount } from "../../resolve-amount";

export interface XenditGatewayOptions {
    secretKey: string;
    /** The "Verification Token" configured in the Xendit dashboard's webhook settings. Required for verifyWebhook(). */
    webhookVerificationToken?: string;
}

/**
 * Indonesia (primary) and broader Southeast Asia (Philippines, Vietnam,
 * Thailand, Malaysia, Singapore). Hosted checkout uses Xendit's Invoices
 * API — the closest fit to this package's "return a URL to redirect to"
 * contract, and Xendit's own recommended flow for a new integration
 * (Virtual Accounts/QRIS/e-wallets are all offered as payment methods
 * WITHIN the one hosted invoice page, so this single API covers Indonesia's
 * most-used local payment methods without extra adapter work).
 *
 * `amount` is a plain major-unit number (matching Chapa's/Mollie's
 * convention, unlike Stripe/Paystack/Razorpay's minor-unit convention) —
 * the adapter converts amountMinor (this package's universal integer
 * minor-unit convention) accordingly.
 *
 * Webhook verification is NOT an HMAC signature — like Flutterwave, Xendit
 * sends a static shared secret (the dashboard's "Verification Token")
 * verbatim in the `x-callback-token` header, compared by exact string
 * equality rather than computed from the request body.
 */
export class XenditGateway implements PaymentGateway {
    readonly name = "xendit";

    /** The real xendit-node client, for anything the normalized interface doesn't cover. */
    public readonly client: any;

    constructor(private readonly options: XenditGatewayOptions) {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { Xendit } = require("xendit-node");
        this.client = new Xendit({ secretKey: options.secretKey });
    }

    async createCheckout(options: CreateCheckoutOptions): Promise<CheckoutSession> {
        const amountMinor = resolveAmount(options);

        const invoice = await this.client.Invoice.createInvoice({
            data: {
                externalId: options.reference,
                amount: this.toMajorUnitNumber(amountMinor),
                currency: options.currency.toUpperCase(),
                payerEmail: options.customerEmail,
                successRedirectUrl: options.successUrl,
                failureRedirectUrl: options.cancelUrl,
                metadata: options.metadata,
            },
        });

        if (!invoice.invoiceUrl) {
            throw new Error(`[nyala/payments] Xendit did not return an invoiceUrl — response: ${JSON.stringify(invoice)}`);
        }

        return { gatewayReference: invoice.id, checkoutUrl: invoice.invoiceUrl, gateway: this.name };
    }

    async verifyWebhook(rawBody: Buffer, headers: Record<string, string | string[] | undefined>): Promise<PaymentEvent | null> {
        if (!this.options.webhookVerificationToken) {
            throw new Error(
                "[nyala/payments] XenditGateway.verifyWebhook() called but no webhookVerificationToken was configured — set the same value as the dashboard's webhook \"Verification Token\" and pass it to XenditGateway's constructor."
            );
        }

        const receivedToken = this.firstHeader(headers["x-callback-token"]);
        if (!receivedToken) return null;

        if (!this.timingSafeEqualStrings(receivedToken, this.options.webhookVerificationToken)) return null;

        let payload: any;
        try {
            payload = JSON.parse(rawBody.toString("utf8"));
        } catch {
            return null;
        }

        return this.normalizeEvent(payload);
    }

    private normalizeEvent(payload: any): PaymentEvent | null {
        // Xendit's Invoice webhook payload is the invoice object itself
        // (not wrapped in an {event, data} envelope like most other
        // gateways) — status field directly tells you the outcome.
        const statusMap: Record<string, PaymentEvent["type"]> = {
            PAID: "payment.succeeded",
            SETTLED: "payment.succeeded",
            EXPIRED: "payment.failed",
        };
        const type = statusMap[payload.status];
        if (!type) return null;

        return {
            type,
            reference: payload.external_id ?? "",
            gatewayReference: payload.id ?? "",
            gateway: this.name,
            amountMinor: Math.round((payload.amount ?? 0) * 100),
            currency: (payload.currency ?? "IDR").toUpperCase(),
            metadata: payload.metadata ?? {},
            raw: payload,
        };
    }

    async refund(gatewayReference: string, amountMinor?: number): Promise<RefundResult> {
        try {
            const refund = await this.client.Refund.createRefund({
                data: {
                    invoiceId: gatewayReference,
                    amount: amountMinor !== undefined ? this.toMajorUnitNumber(amountMinor) : undefined,
                },
            });
            if (refund.status === "SUCCEEDED") {
                return { status: "succeeded", gatewayRefundId: refund.id };
            }
            if (refund.status === "FAILED") {
                return { status: "failed", reason: refund.failureCode ?? "Xendit refund failed" };
            }
            return { status: "pending", gatewayRefundId: refund.id };
        } catch (err) {
            return { status: "failed", reason: err instanceof Error ? err.message : String(err) };
        }
    }

    private toMajorUnitNumber(amountMinor: number): number {
        return amountMinor / 100;
    }

    private firstHeader(value: string | string[] | undefined): string | undefined {
        return Array.isArray(value) ? value[0] : value;
    }

    private timingSafeEqualStrings(a: string, b: string): boolean {
        const bufA = Buffer.from(a, "utf8");
        const bufB = Buffer.from(b, "utf8");
        if (bufA.length !== bufB.length) return false;
        return timingSafeEqual(bufA, bufB);
    }
}

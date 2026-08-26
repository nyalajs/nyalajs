import {
    PaymentGateway,
    CreateCheckoutOptions,
    CheckoutSession,
    PaymentEvent,
    RefundResult,
} from "../../gateway.interface";

export interface MollieGatewayOptions {
    apiKey: string;
    /**
     * Your app's own webhook endpoint URL, given to Mollie at checkout-
     * creation time so it knows where to notify you. Required for
     * verifyWebhook() to be reachable at all — Mollie has no separate
     * "signing secret" concept the way Stripe/Chapa/Paystack do (see
     * verifyWebhook()'s doc comment for why).
     */
    webhookUrl: string;
}

/**
 * Netherlands-based, the simplest integration for pure-EU/SEPA flows —
 * iDEAL (hugely popular in NL), SEPA Direct Debit, SEPA Bank Transfer,
 * Bancontact, and more, all through the same hosted checkout.
 *
 * Mollie's webhook model is architecturally different from every other
 * gateway in this package: there is no HMAC signature to verify locally.
 * A webhook POST is just `id=tr_xxx` (the Mollie payment id, form-encoded)
 * — Mollie's own docs are explicit that the correct way to "verify" a
 * webhook is to immediately call `payments.get(id)` back to Mollie's API
 * and trust ITS authenticated response, not anything present in the
 * incoming request. So verifyWebhook() here parses the id out of the
 * (form-encoded, not JSON) body and makes a real API call — this means,
 * unlike every other gateway's verifyWebhook(), Mollie's involves a live
 * network round trip, and `rawBody` is expected to be
 * `application/x-www-form-urlencoded`, not JSON.
 */
export class MollieGateway implements PaymentGateway {
    readonly name = "mollie";

    /** The real @mollie/api-client client, for anything the normalized interface doesn't cover. */
    public readonly client: any;

    constructor(private readonly options: MollieGatewayOptions) {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { createMollieClient } = require("@mollie/api-client");
        this.client = createMollieClient({ apiKey: options.apiKey });
    }

    async createCheckout(options: CreateCheckoutOptions): Promise<CheckoutSession> {
        const amountMinor = this.resolveAmount(options);

        const payment = await this.client.payments.create({
            amount: { currency: options.currency.toUpperCase(), value: this.toMajorUnitString(amountMinor) },
            description: options.reference,
            redirectUrl: options.successUrl,
            cancelUrl: options.cancelUrl,
            webhookUrl: this.options.webhookUrl,
            metadata: { ...options.metadata, reference: options.reference },
        });

        const checkoutUrl = payment.getCheckoutUrl?.();
        if (!checkoutUrl) {
            throw new Error(`[nyala/payments] Mollie payment ${payment.id} has no checkout URL (unexpected for a fresh "open" payment).`);
        }

        return { gatewayReference: payment.id, checkoutUrl, gateway: this.name };
    }

    /**
     * `rawBody` is expected to be the RAW, un-decoded
     * `application/x-www-form-urlencoded` webhook body Mollie POSTs (e.g.
     * `id=tr_WDqYK6vllg`), not JSON. `headers` is accepted for interface
     * consistency but unused — Mollie's webhook carries no signature
     * header to check.
     */
    async verifyWebhook(rawBody: Buffer, _headers: Record<string, string | string[] | undefined>): Promise<PaymentEvent | null> {
        const params = new URLSearchParams(rawBody.toString("utf8"));
        const paymentId = params.get("id");
        if (!paymentId) return null;

        let payment: any;
        try {
            // The actual "verification" — Mollie's own authenticated
            // response is the source of truth, not anything in the request.
            payment = await this.client.payments.get(paymentId);
        } catch {
            // Not found / API error -> treat as unverifiable, same as a bad signature elsewhere.
            return null;
        }

        return this.normalizeEvent(payment);
    }

    private normalizeEvent(payment: any): PaymentEvent | null {
        const statusMap: Record<string, PaymentEvent["type"]> = {
            paid: "payment.succeeded",
            failed: "payment.failed",
            expired: "payment.failed",
            canceled: "payment.failed",
            open: "payment.pending",
            pending: "payment.pending",
            authorized: "payment.pending",
        };
        const type = statusMap[payment.status];
        if (!type) return null;

        const reference = payment.metadata?.reference ?? payment.description ?? "";
        return {
            type,
            reference,
            gatewayReference: payment.id,
            gateway: this.name,
            amountMinor: Math.round(Number(payment.amount?.value ?? 0) * 100),
            currency: (payment.amount?.currency ?? "EUR").toUpperCase(),
            metadata: payment.metadata ?? {},
            raw: payment,
        };
    }

    async refund(gatewayReference: string, amountMinor?: number): Promise<RefundResult> {
        try {
            const refund = await this.client.paymentRefunds.create({
                paymentId: gatewayReference,
                amount: amountMinor !== undefined ? { currency: "EUR", value: this.toMajorUnitString(amountMinor) } : undefined,
            });
            const succeeded = refund.status === "refunded" || refund.status === "queued";
            return succeeded
                ? { status: refund.status === "refunded" ? "succeeded" : "pending", gatewayRefundId: refund.id }
                : { status: "pending", gatewayRefundId: refund.id };
        } catch (err) {
            return { status: "failed", reason: err instanceof Error ? err.message : String(err) };
        }
    }

    private toMajorUnitString(amountMinor: number): string {
        return (amountMinor / 100).toFixed(2);
    }

    private resolveAmount(options: CreateCheckoutOptions): number {
        if (options.amountMinor !== undefined) return options.amountMinor;
        if (options.lineItems) {
            return options.lineItems.reduce((total, item) => total + item.amountMinor * (item.quantity ?? 1), 0);
        }
        throw new Error("[nyala/payments] createCheckout() needs either lineItems or amountMinor.");
    }
}

import {
    PaymentGateway,
    CreateCheckoutOptions,
    CheckoutSession,
    PaymentEvent,
    RefundResult,
} from "../../gateway.interface";

export interface ChapaGatewayOptions {
    secretKey: string;
    /** Your Chapa webhook signing secret, configured in the Chapa dashboard alongside your webhook URL. Required for verifyWebhook(). */
    webhookSecret?: string;
}

/**
 * Ethiopia's most actively maintained gateway with a real Node SDK
 * (National Bank of Ethiopia licensed). Accepts international cards
 * (Visa/Mastercard/Amex) AND local mobile money/bank rails (TeleBirr,
 * CBE Birr, Amole, HelloCash) through the SAME hosted checkout — using
 * Chapa avoids the slow, bureaucratic direct merchant-account path with
 * Ethio Telecom (TeleBirr) or CBE (CBE Birr) individually.
 *
 * Chapa's `amount` field is a STRING, not a number (unlike every other
 * gateway in this package) — the adapter converts amountMinor (integer
 * minor units, this package's universal convention) to Chapa's expected
 * decimal-string major-unit format (e.g. 10050 minor units -> "100.50").
 * ETB has 2 decimal places, same as USD/EUR/NGN/INR/etc., so this is a
 * flat /100, not currency-specific — flag it if you ever add a
 * zero-decimal currency gateway (e.g. JPY) to this package, since that
 * conversion would need to change.
 */
export class ChapaGateway implements PaymentGateway {
    readonly name = "chapa";

    /** The real chapa-nodejs client, for anything the normalized interface doesn't cover (getBanks, transfer, subaccounts, ...). */
    public readonly client: any;

    constructor(private readonly options: ChapaGatewayOptions) {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { Chapa } = require("chapa-nodejs");
        this.client = new Chapa({ secretKey: options.secretKey });
    }

    async createCheckout(options: CreateCheckoutOptions): Promise<CheckoutSession> {
        const amountMinor = this.resolveAmount(options);

        const response = await this.client.initialize({
            amount: this.toMajorUnitString(amountMinor),
            currency: options.currency.toUpperCase(),
            email: options.customerEmail,
            tx_ref: options.reference,
            return_url: options.successUrl,
            // Chapa has no separate cancel_url — a cancelled/abandoned
            // checkout has nowhere else to redirect to but return_url;
            // your success handler should check the transaction's actual
            // status via verify() rather than assuming success from the
            // redirect alone (Chapa's own docs recommend this).
        });

        if (!response.data?.checkout_url) {
            throw new Error(
                `[nyala/payments] Chapa did not return a checkout_url — response: ${JSON.stringify(response)}`
            );
        }

        return { gatewayReference: options.reference, checkoutUrl: response.data.checkout_url, gateway: this.name };
    }

    async verifyWebhook(rawBody: Buffer, headers: Record<string, string | string[] | undefined>): Promise<PaymentEvent | null> {
        if (!this.options.webhookSecret) {
            throw new Error(
                "[nyala/payments] ChapaGateway.verifyWebhook() called but no webhookSecret was configured — pass one to ChapaGateway's constructor."
            );
        }

        // Chapa's docs specify the signature is sent in a "Chapa-Signature"
        // header (some integrations also see "x-chapa-signature" — both are
        // checked here for compatibility).
        const signature = this.firstHeader(headers["chapa-signature"] ?? headers["x-chapa-signature"]);
        if (!signature) return null;

        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { verifyWebhookSignature } = require("chapa-nodejs");
        // Pass the raw STRING, not a parsed object — the SDK's own
        // verifyWebhookSignature() re-JSON.stringifies any object it's
        // given, which produces a different byte sequence than what was
        // actually signed unless the raw body's own key order/whitespace
        // happens to match JSON.stringify's output exactly (it usually
        // won't). Passing the untouched raw string sidesteps that entirely.
        const rawBodyString = rawBody.toString("utf8");
        const valid = verifyWebhookSignature(rawBodyString, signature, this.options.webhookSecret);
        if (!valid) return null;

        let payload: any;
        try {
            payload = JSON.parse(rawBodyString);
        } catch {
            return null;
        }

        return this.normalizeEvent(payload);
    }

    private normalizeEvent(payload: any): PaymentEvent | null {
        // Chapa's webhook payload shape: { event: "charge.success", tx_ref, amount, currency, ... }
        const eventName = payload.event ?? payload.status;
        const typeMap: Record<string, PaymentEvent["type"]> = {
            "charge.success": "payment.succeeded",
            success: "payment.succeeded",
            "charge.failed": "payment.failed",
            failed: "payment.failed",
        };
        const type = typeMap[eventName];
        if (!type) return null;

        const amountMajor = Number(payload.amount ?? 0);
        return {
            type,
            reference: payload.tx_ref ?? "",
            gatewayReference: payload.tx_ref ?? "",
            gateway: this.name,
            amountMinor: Math.round(amountMajor * 100),
            currency: (payload.currency ?? "ETB").toUpperCase(),
            metadata: payload.meta ?? {},
            raw: payload,
        };
    }

    async refund(gatewayReference: string, amountMinor?: number): Promise<RefundResult> {
        try {
            const response = await this.client.refund({
                tx_ref: gatewayReference,
                amount: amountMinor !== undefined ? this.toMajorUnitString(amountMinor) : undefined,
            });
            if (response.status === "success" || response.status === "successful") {
                return { status: "succeeded", gatewayRefundId: gatewayReference };
            }
            return { status: "pending", gatewayRefundId: gatewayReference };
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

    private firstHeader(value: string | string[] | undefined): string | undefined {
        return Array.isArray(value) ? value[0] : value;
    }
}

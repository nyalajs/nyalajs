import { createHmac, timingSafeEqual } from "node:crypto";
import {
    PaymentGateway,
    CreateCheckoutOptions,
    CheckoutSession,
    PaymentEvent,
    RefundResult,
} from "../../gateway.interface";
import { resolveAmount } from "../../resolve-amount";

export interface PaystackGatewayOptions {
    secretKey: string;
    /** Paystack has no separate webhook signing secret — the SAME secret key used for API calls is also used to verify webhook signatures (see verifyWebhook()'s note). */
    baseUrl?: string;
}

/**
 * Nigeria-based, pan-West-African coverage, Stripe-owned since 2020.
 * Implemented via direct REST calls (Node's built-in fetch) rather than a
 * third-party SDK — Paystack's API is simple enough (POST to initialize a
 * transaction, GET to verify, HMAC over the webhook body) that a thin
 * wrapper here avoids taking on an extra dependency's maintenance risk.
 *
 * Webhook signature is HMAC-SHA512 (hex), NOT SHA256 like most other
 * gateways in this package — a well-known Paystack-specific gotcha (see
 * https://paystack.com/docs/payments/webhooks/). Header is
 * `x-paystack-signature`.
 */
export class PaystackGateway implements PaymentGateway {
    readonly name = "paystack";
    private readonly baseUrl: string;

    constructor(private readonly options: PaystackGatewayOptions) {
        this.baseUrl = options.baseUrl ?? "https://api.paystack.co";
    }

    async createCheckout(options: CreateCheckoutOptions): Promise<CheckoutSession> {
        const amountMinor = resolveAmount(options);

        const response = await this.request("POST", "/transaction/initialize", {
            email: options.customerEmail ?? "no-email-provided@example.com", // Paystack requires an email
            amount: amountMinor, // Paystack's minor-unit convention (kobo for NGN) matches this package's own — no conversion needed
            currency: options.currency.toUpperCase(),
            reference: options.reference,
            callback_url: options.successUrl,
            // Paystack's Standard Checkout has exactly ONE redirect field
            // (callback_url, above) — there is no cancel/failure-redirect
            // concept in this API. options.cancelUrl is passed through in
            // metadata purely for YOUR OWN bookkeeping (round-tripped back
            // on the webhook event) — Paystack never redirects the
            // customer there itself. Namespaced under `nyala` (not a bare
            // `cancel_url` key) so this never silently overwrites a key of
            // the same name you set yourself in your own `metadata`.
            metadata: { ...options.metadata, nyala: { cancelUrl: options.cancelUrl } },
        });

        if (!response.status || !response.data?.authorization_url) {
            throw new Error(`[nyala/payments] Paystack did not return an authorization_url — response: ${JSON.stringify(response)}`);
        }

        return { gatewayReference: response.data.reference ?? options.reference, checkoutUrl: response.data.authorization_url, gateway: this.name };
    }

    async verifyWebhook(rawBody: Buffer, headers: Record<string, string | string[] | undefined>): Promise<PaymentEvent | null> {
        const signature = this.firstHeader(headers["x-paystack-signature"]);
        if (!signature) return null;

        // Paystack signs with the SAME secret key used for API auth — there
        // is no separate webhook-only secret to configure, unlike Stripe/
        // Chapa/Mollie.
        const expected = createHmac("sha512", this.options.secretKey).update(rawBody).digest("hex");

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
        const typeMap: Record<string, PaymentEvent["type"]> = {
            "charge.success": "payment.succeeded",
            "refund.processed": "payment.refunded",
        };
        const type = typeMap[payload.event];
        if (!type) return null;

        const data = payload.data ?? {};
        return {
            type,
            reference: data.reference ?? "",
            gatewayReference: data.reference ?? "",
            gateway: this.name,
            amountMinor: data.amount ?? 0,
            currency: (data.currency ?? "NGN").toUpperCase(),
            metadata: data.metadata ?? {},
            raw: payload,
        };
    }

    async refund(gatewayReference: string, amountMinor?: number): Promise<RefundResult> {
        try {
            const response = await this.request("POST", "/refund", {
                transaction: gatewayReference,
                amount: amountMinor,
            });
            if (!response.status) {
                return { status: "failed", reason: response.message ?? "Unknown Paystack error" };
            }
            const refundStatus = response.data?.status;
            return refundStatus === "processed"
                ? { status: "succeeded", gatewayRefundId: String(response.data?.id ?? gatewayReference) }
                : { status: "pending", gatewayRefundId: String(response.data?.id ?? gatewayReference) };
        } catch (err) {
            return { status: "failed", reason: err instanceof Error ? err.message : String(err) };
        }
    }

    /**
     * Paystack always returns a JSON body with a `status` boolean (true/false)
     * — even on 4xx/5xx responses (e.g. `{"status":false,"message":"Invalid key",...}`
     * for a bad API key, confirmed against the real API) — so callers check
     * `response.status` themselves rather than this method throwing on a
     * non-2xx HTTP status. It only throws if the body itself isn't valid
     * JSON, which would mean something is very wrong (wrong baseUrl, a
     * proxy/CDN error page instead of Paystack's own response, etc.).
     */
    private async request(method: "GET" | "POST", path: string, body?: unknown): Promise<any> {
        const res = await fetch(`${this.baseUrl}${path}`, {
            method,
            headers: {
                Authorization: `Bearer ${this.options.secretKey}`,
                "Content-Type": "application/json",
            },
            body: body !== undefined ? JSON.stringify(body) : undefined,
        });
        try {
            return await res.json();
        } catch {
            throw new Error(`[nyala/payments] Paystack API returned a non-JSON response (HTTP ${res.status} ${res.statusText}).`);
        }
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

import { timingSafeEqual } from "node:crypto";
import {
    PaymentGateway,
    CreateCheckoutOptions,
    CheckoutSession,
    PaymentEvent,
    RefundResult,
} from "../../gateway.interface";
import { resolveAmount } from "../../resolve-amount";

export interface FlutterwaveGatewayOptions {
    publicKey: string;
    secretKey: string;
    /** The "Secret Hash" configured in the Flutterwave dashboard's webhook settings. Required for verifyWebhook(). */
    webhookSecretHash?: string;
}

/**
 * Pan-African coverage (Nigeria, Ghana, Kenya, Tanzania, Uganda, and more)
 * plus international cards. Hosted checkout is created via a direct REST
 * call to `/v3/payments` — the `flutterwave-node-v3` npm package (used
 * here for verify()/refund()) has no method for creating a NEW hosted
 * checkout session; its Transaction/Charge classes are for
 * verification/direct-charge/account-management, not initiating Standard
 * checkout, so createCheckout() bypasses the SDK and calls the endpoint
 * directly (confirmed against the real API — a request with an invalid key
 * returns Flutterwave's actual `{"status":"error","message":...,"data":null}`
 * shape, which this adapter's error handling matches).
 *
 * Webhook verification is NOT an HMAC signature like most gateways in this
 * package — Flutterwave sends a static shared secret (the dashboard's
 * "Secret Hash") verbatim in the `verif-hash` header, compared by exact
 * string equality rather than computed from the request body.
 */
export class FlutterwaveGateway implements PaymentGateway {
    readonly name = "flutterwave";

    /** The real flutterwave-node-v3 client, for verify()/refund() and anything else the normalized interface doesn't cover. */
    public readonly client: any;

    constructor(private readonly options: FlutterwaveGatewayOptions) {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const Flutterwave = require("flutterwave-node-v3");
        this.client = new Flutterwave(options.publicKey, options.secretKey);
    }

    async createCheckout(options: CreateCheckoutOptions): Promise<CheckoutSession> {
        const amountMinor = resolveAmount(options);

        const res = await fetch("https://api.flutterwave.com/v3/payments", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${this.options.secretKey}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                tx_ref: options.reference,
                amount: this.toMajorUnitString(amountMinor),
                currency: options.currency.toUpperCase(),
                redirect_url: options.successUrl,
                customer: options.customerEmail ? { email: options.customerEmail } : undefined,
                // Flutterwave's Standard Checkout has exactly ONE redirect
                // field (redirect_url, above) — no cancel/failure-redirect
                // concept in this API. options.cancelUrl is passed through
                // in meta purely for YOUR OWN bookkeeping (round-tripped
                // back on the webhook event) — Flutterwave never redirects
                // the customer there itself. Namespaced under `nyala` (not
                // a bare `cancel_url` key) so this never silently
                // overwrites a key of the same name you set yourself in
                // your own `metadata`.
                meta: { ...options.metadata, nyala: { cancelUrl: options.cancelUrl } },
            }),
        });

        let json: any;
        try {
            json = await res.json();
        } catch {
            throw new Error(`[nyala/payments] Flutterwave API returned a non-JSON response (HTTP ${res.status} ${res.statusText}).`);
        }

        if (json.status !== "success" || !json.data?.link) {
            throw new Error(`[nyala/payments] Flutterwave did not return a checkout link — response: ${JSON.stringify(json)}`);
        }

        return { gatewayReference: options.reference, checkoutUrl: json.data.link, gateway: this.name };
    }

    async verifyWebhook(rawBody: Buffer, headers: Record<string, string | string[] | undefined>): Promise<PaymentEvent | null> {
        if (!this.options.webhookSecretHash) {
            throw new Error(
                "[nyala/payments] FlutterwaveGateway.verifyWebhook() called but no webhookSecretHash was configured — set the same value as the dashboard's webhook \"Secret Hash\" and pass it to FlutterwaveGateway's constructor."
            );
        }

        const receivedHash = this.firstHeader(headers["verif-hash"]);
        if (!receivedHash) return null;

        // Static shared-secret comparison, not an HMAC over the body —
        // still timing-safe to avoid leaking the hash length/content via
        // response-time side channels.
        if (!this.timingSafeEqualStrings(receivedHash, this.options.webhookSecretHash)) return null;

        let payload: any;
        try {
            payload = JSON.parse(rawBody.toString("utf8"));
        } catch {
            return null;
        }

        return this.normalizeEvent(payload);
    }

    private normalizeEvent(payload: any): PaymentEvent | null {
        // Flutterwave's webhook payload: { event: "charge.completed", data: { tx_ref, amount, currency, status, meta, ... } }
        if (payload.event !== "charge.completed") return null;

        const data = payload.data ?? {};
        const type: PaymentEvent["type"] = data.status === "successful" ? "payment.succeeded" : "payment.failed";

        return {
            type,
            reference: data.tx_ref ?? "",
            gatewayReference: String(data.id ?? data.tx_ref ?? ""),
            gateway: this.name,
            amountMinor: Math.round((data.amount ?? 0) * 100),
            currency: (data.currency ?? "NGN").toUpperCase(),
            metadata: data.meta ?? {},
            raw: payload,
        };
    }

    async refund(gatewayReference: string, amountMinor?: number): Promise<RefundResult> {
        try {
            const response = await this.client.Transaction.refund({
                id: gatewayReference,
                amount: amountMinor !== undefined ? this.toMajorUnitString(amountMinor) : undefined,
            });
            if (response.status === "success") {
                return { status: "pending", gatewayRefundId: String(response.data?.id ?? gatewayReference) };
            }
            return { status: "failed", reason: response.message ?? "Unknown Flutterwave error" };
        } catch (err) {
            return { status: "failed", reason: err instanceof Error ? err.message : String(err) };
        }
    }

    private toMajorUnitString(amountMinor: number): string {
        return (amountMinor / 100).toFixed(2);
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

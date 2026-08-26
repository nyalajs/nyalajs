/**
 * Provider-agnostic payment gateway contract — one interface, many real
 * gateways (Stripe, Chapa, Paystack, Flutterwave, Mollie, Razorpay, Xendit),
 * mirroring @nyalajs/microservices' Transporter/ClientProxy pattern (one
 * contract, five transports) — switching gateways is a config change to
 * PaymentService, not a rewrite of application code.
 *
 * Every gateway here charges through a HOSTED CHECKOUT redirect flow
 * (createCheckout -> a URL you redirect the customer to) rather than
 * raw card-data APIs — this is deliberate: card data never touches your
 * server, no PCI-DSS SAQ-D scope, and it's the flow every gateway below
 * actually recommends for a new integration. A gateway's raw
 * charge-a-token API (if you need it) is available via that adapter's own
 * `client` property, typed to the real underlying SDK.
 */

export type SupportedCurrency = string; // ISO 4217, e.g. "USD", "ETB", "NGN", "EUR", "INR", "IDR"

export interface CheckoutLineItem {
    name: string;
    /** Smallest currency unit (cents for USD, kobo for NGN, etc.) — matches how every gateway below actually accepts amounts, avoiding float rounding entirely. */
    amountMinor: number;
    quantity?: number;
}

export interface CreateCheckoutOptions {
    /** Your own order/invoice id — every gateway adapter round-trips this back on the webhook event so you can look up the order without a second DB query keyed by the gateway's own id. */
    reference: string;
    currency: SupportedCurrency;
    /** Either pass line items (gateway computes the total) or a flat amount — at least one is required. */
    lineItems?: CheckoutLineItem[];
    /** Smallest currency unit. Required if lineItems is omitted; must match the lineItems sum if both are given (adapters do NOT silently reconcile a mismatch — they throw). */
    amountMinor?: number;
    customerEmail?: string;
    /** Where the customer lands after a successful payment. */
    successUrl: string;
    /** Where the customer lands if they cancel/back out. */
    cancelUrl: string;
    /** Arbitrary metadata round-tripped back on the webhook event (order id, tenant id, etc.) — every gateway supports SOME form of this, adapters normalize the shape. */
    metadata?: Record<string, string>;
}

export interface CheckoutSession {
    /** The gateway's own session/order id — store this alongside your reference if you need to query the gateway directly later. */
    gatewayReference: string;
    /** Redirect the customer here to complete payment. */
    checkoutUrl: string;
    /** Which gateway created this (matches PaymentGateway.name) — useful when persisting a Payment row that can come from any gateway. */
    gateway: string;
}

export type RefundResult =
    | { status: "succeeded"; gatewayRefundId: string }
    | { status: "pending"; gatewayRefundId: string }
    | { status: "failed"; reason: string };

export type PaymentEventType = "payment.succeeded" | "payment.failed" | "payment.refunded" | "payment.pending";

/** Normalized shape every gateway's webhook payload is translated into — application code handles ONE event shape regardless of which gateway sent it. */
export interface PaymentEvent {
    type: PaymentEventType;
    /** The `reference` you passed to createCheckout(). */
    reference: string;
    gatewayReference: string;
    gateway: string;
    amountMinor: number;
    currency: SupportedCurrency;
    metadata: Record<string, string>;
    /** The gateway's own raw event payload, for anything the normalized shape doesn't cover. */
    raw: unknown;
}

export interface PaymentGateway {
    /** Short, stable identifier — "stripe", "chapa", "paystack", etc. Matches CheckoutSession.gateway and PaymentEvent.gateway. */
    readonly name: string;

    createCheckout(options: CreateCheckoutOptions): Promise<CheckoutSession>;

    /**
     * Verifies a webhook request's signature and, if valid, parses it into
     * a normalized PaymentEvent. Returns `null` for a signature that fails
     * verification — callers MUST treat null as "reject this request"
     * (401/400), never as "no event to process" (silently accepting an
     * unverified webhook is how payment fraud gets through).
     *
     * `rawBody` must be the exact, unparsed request bytes — every gateway's
     * signature is computed over the raw body, and re-serializing a
     * JSON-parsed body produces a different byte sequence that will never
     * verify, even for a genuine request.
     */
    verifyWebhook(rawBody: Buffer, headers: Record<string, string | string[] | undefined>): Promise<PaymentEvent | null>;

    /** Refunds a previously completed payment, identified by the gateway's own reference (CheckoutSession.gatewayReference, or the id your PaymentEvent handler received). */
    refund(gatewayReference: string, amountMinor?: number): Promise<RefundResult>;
}

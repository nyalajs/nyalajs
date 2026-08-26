# @nyalajs/payments

Multi-region payment gateway abstraction for NyalaJS. One `PaymentGateway` interface, seven real adapters — Stripe, Chapa, Paystack, Flutterwave, Mollie, Razorpay, Xendit — covering international/US/EU, Ethiopia, broader Africa, Europe/SEPA, India, and Southeast Asia. Mirrors `@nyalajs/microservices`' `Transporter`/`ClientProxy` pattern: one contract, many real backends, switching gateways is a config change.

## Coverage

| Region | Gateway | Notes |
|---|---|---|
| International / US | `StripeGateway` | The baseline; also covers most of Europe |
| Europe / SEPA / iDEAL | `MollieGateway` | Netherlands-based; simplest pure-EU integration |
| Ethiopia | `ChapaGateway` | National Bank of Ethiopia licensed; covers TeleBirr/CBE Birr/Amole alongside cards through one checkout |
| Africa (Nigeria + West Africa) | `PaystackGateway` | Stripe-owned since 2020 |
| Africa (pan-African) | `FlutterwaveGateway` | Nigeria, Ghana, Kenya, Tanzania, Uganda, and more |
| India | `RazorpayGateway` | UPI support — India's national instant-payment rails |
| Southeast Asia | `XenditGateway` | Indonesia (primary), Philippines, Vietnam, Thailand, Malaysia, Singapore |

### China (Alipay / WeChat Pay)

**No direct adapter, deliberately.** A non-China-registered business cannot obtain a direct Alipay or WeChat Pay merchant account — both require China business registration and banking. The correct integration path for an international merchant is through an aggregator that already holds that relationship: `StripeGateway` and `MollieGateway`'s underlying providers both support Alipay/WeChat Pay as a payment *method* on their hosted checkout (not a separate gateway integration) for eligible merchants — check your Stripe/Mollie account's available payment methods rather than looking for a `ChinaGateway` here. If you need it and it's not enabled on your account, that's an account-configuration conversation with Stripe/Mollie, not something this package can route around.

## Quick start

`createPaymentService()` is the one-call setup path — plain config in, a fully wired service out. No gateway class to import or construct by hand.

```ts
import { createPaymentService } from "@nyalajs/payments";

const payments = createPaymentService({
  gateways: {
    stripe: { provider: "stripe", secretKey: process.env.STRIPE_SECRET_KEY!, webhookSecret: process.env.STRIPE_WEBHOOK_SECRET },
    chapa: { provider: "chapa", secretKey: process.env.CHAPA_SECRET_KEY!, webhookSecret: process.env.CHAPA_WEBHOOK_SECRET },
  },
  default: "stripe",
});

const session = await payments.createCheckout({
  reference: order.id,
  currency: "USD",
  amountMinor: 4999, // $49.99, in cents — every gateway's amount is in minor units at this layer
  successUrl: "https://myapp.com/orders/success",
  cancelUrl: "https://myapp.com/orders/cancelled",
}); // uses "stripe" (the default)

// Route a specific order through a different configured gateway explicitly:
await payments.createCheckout({ ... }, "chapa");

redirect(session.checkoutUrl);
```

Switching or adding a gateway is a config change — add an entry to `gateways`, nothing else in your app needs to change. Every `provider` value (`"stripe"`, `"chapa"`, `"paystack"`, `"flutterwave"`, `"mollie"`, `"razorpay"`, `"xendit"`) takes exactly that gateway's own constructor options alongside it — your editor's autocomplete narrows the required fields once you set `provider`.

<details>
<summary>Constructing gateways directly instead (advanced)</summary>

If you need something `createPaymentService()` can't express — a hand-built gateway subclass, for instance — construct `PaymentService` yourself:

```ts
import { PaymentService, StripeGateway, ChapaGateway } from "@nyalajs/payments";

const service = new PaymentService(
  {
    stripe: new StripeGateway({ secretKey: process.env.STRIPE_SECRET_KEY!, webhookSecret: process.env.STRIPE_WEBHOOK_SECRET }),
    chapa: new ChapaGateway({ secretKey: process.env.CHAPA_SECRET_KEY!, webhookSecret: process.env.CHAPA_WEBHOOK_SECRET }),
  },
  { default: "stripe" }
);
```

</details>

## Webhooks

```ts
import { FastifyAdapter } from "@nyalajs/http";
import { mountWebhookRoute } from "@nyalajs/payments";

await mountWebhookRoute(httpAdapter.getInstance(), stripeGateway, {
  path: "/webhooks/stripe",
  onEvent: async (event) => {
    if (event.type === "payment.succeeded") {
      await orders.markPaid(event.reference);
    }
  },
});
```

`mountWebhookRoute()` registers its own scoped raw-body parser for that one route — every gateway's signature verification needs the exact, unparsed request bytes (a re-serialized JSON body produces a different byte sequence and will never verify, even for a genuine request). This doesn't affect how any other route on the same Fastify instance parses JSON. A request that fails signature verification gets a `401` and your `onEvent` handler is never called — that's the actual fraud-prevention boundary.

Mount one route per gateway you accept webhooks from.

## The `PaymentGateway` interface

```ts
interface PaymentGateway {
  readonly name: string;
  createCheckout(options: CreateCheckoutOptions): Promise<CheckoutSession>;
  verifyWebhook(rawBody: Buffer, headers: Record<string, string | string[] | undefined>): Promise<PaymentEvent | null>;
  refund(gatewayReference: string, amountMinor?: number): Promise<RefundResult>;
}
```

Every gateway charges through a **hosted checkout redirect** — `createCheckout()` returns a URL you send the customer to. Card data never touches your server (no PCI-DSS SAQ-D scope), and it's the flow every gateway here actually recommends for a new integration. Reach a gateway's raw SDK for anything beyond this (subscriptions, transfers, virtual accounts, ...) via its `.client` property — every adapter exposes the real underlying SDK instance.

Amounts are always **minor units** (cents, kobo, paise, ...) at this layer — `amountMinor: 4999` for $49.99 — regardless of which gateway you're calling; adapters that need major-unit decimal strings (Chapa, Mollie, Xendit) or major-unit numbers do that conversion internally.

## Webhook verification per gateway

Every gateway's `verifyWebhook()` is genuinely different under the hood — worth knowing if you're debugging one:

| Gateway | Mechanism | Header |
|---|---|---|
| Stripe | HMAC-SHA256, timestamped | `Stripe-Signature` |
| Chapa | HMAC-SHA256 | `Chapa-Signature` (or `x-chapa-signature`) |
| Paystack | **HMAC-SHA512** (not SHA256 — a well-known Paystack-specific gotcha) | `x-paystack-signature` |
| Flutterwave | Static shared secret, exact string match (no HMAC) | `verif-hash` |
| Mollie | **No local signature at all** — a live API call back to Mollie by the payment id in the (form-encoded) body is the actual verification | n/a |
| Razorpay | HMAC-SHA256 | `X-Razorpay-Signature` |
| Xendit | Static shared secret, exact string match (no HMAC) | `x-callback-token` |

All comparisons in this package use `crypto.timingSafeEqual` regardless of whether the underlying SDK's own helper does.

## What's NOT Included

- **No subscription/recurring-billing abstraction** — each gateway's own subscription API is reachable via `.client`, but this package's normalized interface is one-time-checkout only.
- **No stored-card/tokenization abstraction** — same reasoning; use a gateway's `.client` directly if you need it.
- **No direct China (Alipay/WeChat Pay) adapter** — see the Coverage table above for why, and the actual integration path.
- **No automatic currency conversion** — `amountMinor`/`currency` are passed straight through to the gateway; FX is the gateway's problem, not this package's.

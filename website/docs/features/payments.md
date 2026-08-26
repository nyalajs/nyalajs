# Payments

`@nyalajs/payments` adds multi-region payment gateway support — one `PaymentGateway` interface, seven real adapters covering international/US/EU, Ethiopia, broader Africa, Europe/SEPA, India, and Southeast Asia. Mirrors [Microservices](./microservices)' `Transporter`/`ClientProxy` pattern: one contract, many real backends, switching gateways is a config change, not a rewrite.

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

### A note on China (Alipay / WeChat Pay)

There's no direct adapter for these, and that's deliberate rather than a gap to fill later: a non-China-registered business cannot obtain a direct Alipay or WeChat Pay merchant account — both require China business registration and banking. The correct integration path for an international merchant is through an aggregator that already holds that relationship. `StripeGateway` and `MollieGateway`'s underlying providers both support Alipay/WeChat Pay as a payment *method* on their hosted checkout (not a separate gateway integration) for eligible merchant accounts — check what payment methods are enabled on your Stripe/Mollie account rather than looking for a `ChinaGateway` here.

## Quick start

`createPaymentService()` is the one-call setup path — plain config in, a fully wired service out. No gateway class to import or construct by hand.

```typescript
import { createPaymentService } from '@nyalajs/payments';

const payments = createPaymentService({
  gateways: {
    stripe: { provider: 'stripe', secretKey: process.env.STRIPE_SECRET_KEY!, webhookSecret: process.env.STRIPE_WEBHOOK_SECRET },
    chapa: { provider: 'chapa', secretKey: process.env.CHAPA_SECRET_KEY!, webhookSecret: process.env.CHAPA_WEBHOOK_SECRET },
  },
  default: 'stripe',
});

const session = await payments.createCheckout({
  reference: order.id,
  currency: 'USD',
  amountMinor: 4999, // $49.99, in cents
  successUrl: 'https://myapp.com/orders/success',
  cancelUrl: 'https://myapp.com/orders/cancelled',
}); // uses "stripe" (the configured default)

// Route a specific order through a different configured gateway explicitly:
await payments.createCheckout({ /* ... */ }, 'chapa');

redirect(session.checkoutUrl);
```

Switching or adding a gateway is a config change — add an entry to `gateways`, nothing else in your app needs to change. Each `provider` value takes exactly that gateway's own constructor options alongside it (`secretKey`, `webhookSecret`, and so on — see each gateway's row in the Coverage table above for which options it needs).

Amounts are always **minor units** (cents, kobo, paise, ...) at this layer regardless of which gateway you call — `amountMinor: 4999` for $49.99. Adapters that need major-unit decimal strings (Chapa, Mollie) or major-unit numbers (Xendit) convert internally.

Need something `createPaymentService()` can't express (a hand-built gateway subclass, for instance)? Construct `PaymentService` directly with real gateway instances instead: `new PaymentService({ stripe: new StripeGateway({...}) }, { default: 'stripe' })`.

## Webhooks

```typescript
import { FastifyAdapter } from '@nyalajs/http';
import { mountWebhookRoute } from '@nyalajs/payments';

await mountWebhookRoute(httpAdapter.getInstance(), stripeGateway, {
  path: '/webhooks/stripe',
  onEvent: async (event) => {
    if (event.type === 'payment.succeeded') {
      await orders.markPaid(event.reference);
    }
  },
});
```

`mountWebhookRoute()` registers its own scoped raw-body content-type parser for that one route — every gateway's signature verification needs the exact, unparsed request bytes; a body Fastify has already JSON-decoded and would re-serialize produces a different byte sequence and never verifies, even for a genuine request. This doesn't affect how any other route on the same Fastify instance parses JSON.

A request that fails signature verification gets a `401` response and your `onEvent` handler is never called — this is the actual fraud-prevention boundary, not just an implementation detail. Mount one route per gateway you accept webhooks from.

## The `PaymentGateway` interface

```typescript
interface PaymentGateway {
  readonly name: string;
  createCheckout(options: CreateCheckoutOptions): Promise<CheckoutSession>;
  verifyWebhook(rawBody: Buffer, headers: Record<string, string | string[] | undefined>): Promise<PaymentEvent | null>;
  refund(gatewayReference: string, amountMinor?: number): Promise<RefundResult>;
}
```

Every gateway charges through a **hosted checkout redirect** — `createCheckout()` returns a URL you send the customer to. Card data never touches your server (no PCI-DSS SAQ-D scope), and it's the flow every gateway here actually recommends for a new integration. Reach a gateway's raw SDK for anything beyond this (subscriptions, transfers, virtual accounts, ...) via its `.client` property — every adapter exposes the real underlying SDK instance, and `PaymentService.getRawClient(name?)` reaches it through the service layer too.

## Webhook verification per gateway

Every gateway's `verifyWebhook()` is genuinely different under the hood — worth knowing when debugging one:

| Gateway | Mechanism | Header |
|---|---|---|
| Stripe | HMAC-SHA256, timestamped | `Stripe-Signature` |
| Chapa | HMAC-SHA256 | `Chapa-Signature` (or `x-chapa-signature`) |
| Paystack | **HMAC-SHA512** (not SHA256 — a well-known Paystack-specific detail) | `x-paystack-signature` |
| Flutterwave | Static shared secret, exact string match (no HMAC) | `verif-hash` |
| Mollie | **No local signature at all** — verification is a live API call back to Mollie by the payment id in the (form-encoded, not JSON) body | n/a |
| Razorpay | HMAC-SHA256 | `X-Razorpay-Signature` |
| Xendit | Static shared secret, exact string match (no HMAC) | `x-callback-token` |

All comparisons in this package use `crypto.timingSafeEqual`, regardless of whether a given gateway's own SDK helper does.

## What's NOT Included

- **No subscription/recurring-billing abstraction** — each gateway's own subscription API is reachable via `.client`, but this package's normalized interface is one-time-checkout only.
- **No stored-card/tokenization abstraction** — same reasoning; use a gateway's `.client` directly if you need it.
- **No direct China (Alipay/WeChat Pay) adapter** — see the Coverage section above for why, and the actual integration path.
- **No automatic currency conversion** — `amountMinor`/`currency` are passed straight through to the gateway; FX is the gateway's problem, not this package's.

## Next Steps

- [Microservices](./microservices) - The same one-interface-many-backends pattern this package's `PaymentGateway` mirrors
- [Permissions](./permissions) - Gate who can issue refunds or view payment data
- [Multi-Tenancy](../multi-tenancy/overview) - Scoping payment records per tenant in your own order/payment models

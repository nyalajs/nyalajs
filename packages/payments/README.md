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

Set your gateway credentials in `.env` using the `PAYMENTS_{PROVIDER}_{FIELD}` convention, then `createPaymentServiceFromEnv()` reads them for you — the only code is which gateways to enable:

```bash
# .env
PAYMENTS_STRIPE_SECRET_KEY=sk_live_...
PAYMENTS_STRIPE_WEBHOOK_SECRET=whsec_...
PAYMENTS_CHAPA_SECRET_KEY=CHASECK_...
PAYMENTS_CHAPA_WEBHOOK_SECRET=...
```

```ts
import { createPaymentServiceFromEnv } from "@nyalajs/payments";

const payments = createPaymentServiceFromEnv({
  gateways: { stripe: true, chapa: true },
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

Enabling a gateway is a one-line change (`chapa: true`) — no env var names to spell out, no gateway class to import. If a required variable is missing, it throws once at startup with the complete list of everything missing across every enabled gateway, not one failure at a time as each gateway is first used. See [`env-vars`](#every-provider-and-its-env-vars) below for the full list, and use a per-field override (`{ stripe: { secretKey: "MY_CUSTOM_VAR_NAME" } }`) if your `.env` already uses different names.

<details>
<summary>Passing config explicitly instead of reading <code>.env</code> (advanced)</summary>

`createPaymentService()` takes the same shape `fromEnv()` builds internally — use it directly if you're reading credentials from somewhere other than environment variables (a secrets manager, `ConfigService`, ...), or just prefer to see every field spelled out:

```ts
import { createPaymentService } from "@nyalajs/payments";

const payments = createPaymentService({
  gateways: {
    stripe: { provider: "stripe", secretKey: process.env.STRIPE_SECRET_KEY!, webhookSecret: process.env.STRIPE_WEBHOOK_SECRET },
    chapa: { provider: "chapa", secretKey: process.env.CHAPA_SECRET_KEY!, webhookSecret: process.env.CHAPA_WEBHOOK_SECRET },
  },
  default: "stripe",
});
```

Every `provider` value (`"stripe"`, `"chapa"`, `"paystack"`, `"flutterwave"`, `"mollie"`, `"razorpay"`, `"xendit"`) takes exactly that gateway's own constructor options alongside it — your editor's autocomplete narrows the required fields once you set `provider`.

</details>

<details>
<summary>Constructing gateways directly instead (advanced)</summary>

If you need something neither helper can express — a hand-built gateway subclass, for instance — construct `PaymentService` yourself:

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

### Every provider and its env vars

| Provider | Required | Optional |
|---|---|---|
| `stripe` | `PAYMENTS_STRIPE_SECRET_KEY` | `PAYMENTS_STRIPE_WEBHOOK_SECRET` |
| `chapa` | `PAYMENTS_CHAPA_SECRET_KEY` | `PAYMENTS_CHAPA_WEBHOOK_SECRET` |
| `paystack` | `PAYMENTS_PAYSTACK_SECRET_KEY` | `PAYMENTS_PAYSTACK_BASE_URL` |
| `flutterwave` | `PAYMENTS_FLUTTERWAVE_PUBLIC_KEY`, `PAYMENTS_FLUTTERWAVE_SECRET_KEY` | `PAYMENTS_FLUTTERWAVE_WEBHOOK_SECRET_HASH` |
| `mollie` | `PAYMENTS_MOLLIE_API_KEY`, `PAYMENTS_MOLLIE_WEBHOOK_URL` | — (both required; Mollie has no separate signing secret, `webhookUrl` is what makes the live-lookup verification reachable) |
| `razorpay` | `PAYMENTS_RAZORPAY_KEY_ID`, `PAYMENTS_RAZORPAY_KEY_SECRET` | `PAYMENTS_RAZORPAY_WEBHOOK_SECRET` |
| `xendit` | `PAYMENTS_XENDIT_SECRET_KEY` | `PAYMENTS_XENDIT_WEBHOOK_VERIFICATION_TOKEN` |

Optional fields left unset are simply omitted from that gateway's config (e.g. `verifyWebhook()` isn't usable until you set one) — only missing REQUIRED fields cause `createPaymentServiceFromEnv()` to throw.

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

`successUrl` is a real redirect on every gateway. `cancelUrl` is NOT — some gateways' hosted checkout genuinely has no cancel/failure-redirect field at all:

| Gateway | `cancelUrl` behavior |
|---|---|
| Stripe, Mollie, Xendit | Real, distinct redirect — the customer actually lands there on cancel |
| Chapa, Razorpay | No cancel-redirect concept in the API — silently unused. Check the transaction's real status via a webhook/status lookup instead of assuming a redirect happened |
| Paystack, Flutterwave | No real cancel-redirect either — passed through as webhook-event metadata (`event.metadata.nyala.cancelUrl`) purely for your own bookkeeping, never an actual customer redirect |

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

# @nyalajs/payments

## 0.3.3

### Patch Changes

- Fix `mountWebhookRoute()` crashing with `FST_ERR_CTP_ALREADY_PRESENT` when the app's Fastify instance already has a global body parser for `application/json` or `application/x-www-form-urlencoded` registered via a plugin that bypasses normal Fastify encapsulation (`@fastify/formbody`, which `@nyalajs/http`'s `FastifyAdapter` registers by default, is exactly this case). `mountWebhookRoute()` now removes any existing parser for these content types within its own nested scope before adding the raw-buffer parser webhook signature verification needs, instead of assuming none exists — confirmed against a real Fastify instance with `@fastify/formbody` registered that this previously crashed the whole app at boot.
- Updated dependencies
- Updated dependencies
  - @nyalajs/core@2.3.2
  - @nyalajs/http@2.3.1

## 0.3.2

### Patch Changes

- Fixed a real input-validation gap found during a security/enterprise-readiness audit: `resolveAmount()` — the logic every one of the 7 gateway adapters used to compute a checkout's total from `amountMinor`/`lineItems` — was duplicated verbatim across all 7 files with **zero validation** beyond "one of the two was given." A negative, zero, or non-integer `amountMinor` (or a negative/zero line-item amount or quantity) would previously reach a real gateway's API completely unchecked. Centralized into one shared, validated `resolveAmount()` that every gateway (including Stripe, whose `validateAmount()` had the same gap) now calls — rejects any non-positive or non-integer amount, at every level (overall total AND each individual line item), before any network call is made. 15 new unit tests plus a dedicated negative-amount regression test added to every gateway's own spec file (never reaches the network). 129 tests total in the package.
- Also part of the same audit: confirmed (and added a regression test for) the webhook route's DoS protection — an oversized request body is rejected with HTTP 413 by Fastify's own `bodyLimit` before signature verification ever runs, automatically for any route mounted via `mountWebhookRoute()`.

## 0.3.1

### Patch Changes

- Fixed `cancelUrl` silently colliding with a caller's own `metadata.cancel_url` key for `PaystackGateway`/`FlutterwaveGateway` — both stuffed `options.cancelUrl` directly into `metadata.cancel_url`/`meta.cancel_url` (since neither gateway's hosted checkout has a real cancel-redirect field), unconditionally overwriting any same-named key the caller had set in their own `metadata`. Now namespaced under `metadata.nyala.cancelUrl` / `meta.nyala.cancelUrl` so it can never collide.
- Documented, for the first time, that `cancelUrl` is NOT uniformly honored across all 7 gateways — `CreateCheckoutOptions.cancelUrl`'s doc comment now explains exactly which gateways redirect there for real (Stripe, Mollie, Xendit), which have no cancel-redirect concept and silently ignore it (Chapa, Razorpay), and which pass it through as webhook-event metadata only, never an actual redirect (Paystack, Flutterwave). `RazorpayGateway.createCheckout()` previously dropped `cancelUrl` with zero explanation in the code; added the same kind of comment `ChapaGateway` already had for its identical real API limitation.
- Verified via real `fetch`/SDK-client spies observing the actual outgoing request bodies (the real network calls still go out and fail against the real APIs as before — this only adds inspection of what's sent, nothing is mocked).

## 0.3.0

### Minor Changes

- New `createPaymentServiceFromEnv()` — reads gateway credentials straight from environment variables by a documented naming convention (`PAYMENTS_{PROVIDER}_{FIELD}`, e.g. `PAYMENTS_STRIPE_SECRET_KEY`, `PAYMENTS_CHAPA_WEBHOOK_SECRET`), so setting up a gateway is dropping values into `.env` plus a one-line `{ stripe: true }` — no `process.env.X` spelled out per field, no gateway class to import. Per-field overrides (`{ stripe: { secretKey: "MY_CUSTOM_VAR" } }`) are supported for `.env` files that don't follow the convention. Throws ONE error listing every missing required variable across every enabled gateway at startup, rather than failing one gateway at a time as each is first used. `createPaymentService()` (explicit config) is unchanged and still the right choice for reading credentials from anywhere other than environment variables. This is now the documented Quick Start entry point in the README and website docs; `createPaymentService()` moved to an "advanced" collapsible section alongside manual gateway construction.

## 0.2.1

### Patch Changes

- Fixed `RazorpayGateway.refund()` collapsing every real failure into the useless string `"[object Object]"`. The `razorpay` SDK rejects with a plain object (`{ statusCode, error: { code, description } }`), not a real `Error` instance, so the generic `err instanceof Error ? err.message : String(err)` fallback used by every other gateway's `refund()` was silently swallowing the actual failure reason for this one gateway. Added a dedicated `extractErrorMessage()` that reads Razorpay's real error shape first (`error.description`, falling back to a `statusCode`-based message, then to `String()`), verified against the real Razorpay API's actual 401/404 response shapes.
- Completed `refund()` and lineItems-summation test coverage for all 7 gateways (previously only Stripe and a subset of others had these), each verified against that gateway's real production API with intentionally invalid credentials: confirmed Flutterwave's SDK requires `amount` client-side before it will even attempt the refund call, and that Mollie/Xendit both normalize their real thrown errors correctly.

# @nyalajs/payments

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

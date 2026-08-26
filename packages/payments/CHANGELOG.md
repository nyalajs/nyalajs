# @nyalajs/payments

## 0.2.1

### Patch Changes

- Fixed `RazorpayGateway.refund()` collapsing every real failure into the useless string `"[object Object]"`. The `razorpay` SDK rejects with a plain object (`{ statusCode, error: { code, description } }`), not a real `Error` instance, so the generic `err instanceof Error ? err.message : String(err)` fallback used by every other gateway's `refund()` was silently swallowing the actual failure reason for this one gateway. Added a dedicated `extractErrorMessage()` that reads Razorpay's real error shape first (`error.description`, falling back to a `statusCode`-based message, then to `String()`), verified against the real Razorpay API's actual 401/404 response shapes.
- Completed `refund()` and lineItems-summation test coverage for all 7 gateways (previously only Stripe and a subset of others had these), each verified against that gateway's real production API with intentionally invalid credentials: confirmed Flutterwave's SDK requires `amount` client-side before it will even attempt the refund call, and that Mollie/Xendit both normalize their real thrown errors correctly.

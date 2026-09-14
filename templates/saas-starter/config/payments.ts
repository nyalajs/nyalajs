/**
 * Payment gateway configuration — see @nyalajs/payments' README for the
 * full list of supported gateways and their env vars
 * (PAYMENTS_{PROVIDER}_{FIELD}, e.g. PAYMENTS_STRIPE_SECRET_KEY). Stripe
 * is wired by default here; enabling a different (or additional) gateway
 * is a change to `gateways` in app.module.ts's PaymentService provider —
 * no code elsewhere needs to change.
 */
export default {
    defaultGateway: process.env.PAYMENTS_DEFAULT_GATEWAY || "stripe",
};

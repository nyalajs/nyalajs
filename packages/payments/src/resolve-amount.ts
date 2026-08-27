import { CreateCheckoutOptions } from "./gateway.interface";

/**
 * Computes the checkout total in minor units from `CreateCheckoutOptions`
 * — either `amountMinor` directly, or the sum of `lineItems` — and
 * validates the result before any gateway adapter sends it over the wire.
 *
 * Previously duplicated verbatim across all 7 gateway adapters with NO
 * validation beyond "one of lineItems/amountMinor was given" — a caller
 * could pass `amountMinor: -500` or an empty `lineItems: []` (summing to
 * 0) and it would reach the real payment gateway's API unchecked, left
 * entirely to whatever that gateway happened to do with a negative/zero
 * charge amount rather than failing fast with a clear error at the one
 * place that actually knows the computed total. Centralized here so every
 * adapter gets the same validation for free, with one implementation to
 * keep correct instead of seven copies that can silently drift apart.
 *
 * @throws if neither lineItems nor amountMinor is given, if both are given
 *   but disagree, if the resolved amount is not a positive finite integer,
 *   or if any individual line item's amountMinor/quantity is invalid.
 */
export function resolveAmount(options: CreateCheckoutOptions): number {
    if (options.lineItems) {
        for (const item of options.lineItems) {
            if (!Number.isInteger(item.amountMinor) || item.amountMinor <= 0) {
                throw new Error(
                    `[nyala/payments] createCheckout() line item "${item.name}" has an invalid amountMinor (${item.amountMinor}) — must be a positive integer.`
                );
            }
            if (item.quantity !== undefined && (!Number.isInteger(item.quantity) || item.quantity <= 0)) {
                throw new Error(
                    `[nyala/payments] createCheckout() line item "${item.name}" has an invalid quantity (${item.quantity}) — must be a positive integer.`
                );
            }
        }
    }

    let resolved: number;
    if (options.amountMinor !== undefined && options.lineItems) {
        const sum = options.lineItems.reduce((total, item) => total + item.amountMinor * (item.quantity ?? 1), 0);
        if (sum !== options.amountMinor) {
            throw new Error(
                `[nyala/payments] createCheckout() was given both lineItems (summing to ${sum}) and amountMinor (${options.amountMinor}) that disagree.`
            );
        }
        resolved = sum;
    } else if (options.amountMinor !== undefined) {
        resolved = options.amountMinor;
    } else if (options.lineItems) {
        resolved = options.lineItems.reduce((total, item) => total + item.amountMinor * (item.quantity ?? 1), 0);
    } else {
        throw new Error("[nyala/payments] createCheckout() needs either lineItems or amountMinor.");
    }

    if (!Number.isInteger(resolved) || resolved <= 0) {
        throw new Error(
            `[nyala/payments] createCheckout() resolved to an invalid amount (${resolved} minor units) — the total must be a positive integer. ` +
            "Zero-amount and negative-amount checkouts are not supported by any gateway this package integrates."
        );
    }
    // Reject anything beyond what every supported gateway's own API can
    // safely represent as an integer amount (Number.MAX_SAFE_INTEGER is
    // the real ceiling where floating-point precision loss becomes
    // possible for amountMinor arithmetic) — this is a sanity backstop
    // against a caller accidentally passing a wildly wrong unit (e.g.
    // major units where minor units were expected), not a realistic
    // legitimate charge size.
    if (resolved > Number.MAX_SAFE_INTEGER) {
        throw new Error(`[nyala/payments] createCheckout() resolved to an amount (${resolved}) too large to represent safely.`);
    }

    return resolved;
}

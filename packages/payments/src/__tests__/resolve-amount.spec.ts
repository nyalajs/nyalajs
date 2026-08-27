import { describe, it, expect } from "vitest";
import { resolveAmount } from "../resolve-amount";

// resolveAmount() centralizes logic that used to be duplicated (with NO
// positivity/finiteness validation at all) across all 7 gateway adapters'
// private resolveAmount()/validateAmount() methods — a caller could
// previously pass a negative or zero amountMinor straight through to a
// real payment gateway's API with no local check at all. These tests
// prove the validation actually rejects every unsafe input, not just that
// the happy path still sums correctly (already covered by each gateway's
// own lineItems-summation tests).

const base = {
    reference: "order-1",
    currency: "USD" as const,
    successUrl: "https://example.com/ok",
    cancelUrl: "https://example.com/cancel",
};

describe("resolveAmount() — the shared amount-resolution + validation every gateway adapter now uses", () => {
    it("returns amountMinor directly when given alone", () => {
        expect(resolveAmount({ ...base, amountMinor: 5000 })).toBe(5000);
    });

    it("sums lineItems (respecting quantity) when amountMinor is omitted", () => {
        expect(
            resolveAmount({
                ...base,
                lineItems: [
                    { name: "Widget", amountMinor: 1000, quantity: 3 },
                    { name: "Fee", amountMinor: 500 }, // quantity defaults to 1
                ],
            })
        ).toBe(3500);
    });

    it("throws when neither lineItems nor amountMinor is given", () => {
        expect(() => resolveAmount({ ...base })).toThrow(/lineItems or amountMinor/);
    });

    it("throws when lineItems and amountMinor are both given but disagree", () => {
        expect(() =>
            resolveAmount({ ...base, amountMinor: 999, lineItems: [{ name: "Widget", amountMinor: 1000 }] })
        ).toThrow(/disagree/);
    });

    it("does NOT throw when lineItems and amountMinor are both given and agree", () => {
        expect(resolveAmount({ ...base, amountMinor: 2000, lineItems: [{ name: "Widget", amountMinor: 1000, quantity: 2 }] })).toBe(2000);
    });

    it("REJECTS a negative amountMinor — the real gap this centralization closes", () => {
        expect(() => resolveAmount({ ...base, amountMinor: -500 })).toThrow(/invalid amount.*-500/i);
    });

    it("REJECTS a zero amountMinor", () => {
        expect(() => resolveAmount({ ...base, amountMinor: 0 })).toThrow(/invalid amount.*0/i);
    });

    it("REJECTS a non-integer amountMinor (e.g. a major-unit decimal accidentally passed as minor units)", () => {
        expect(() => resolveAmount({ ...base, amountMinor: 49.99 })).toThrow(/invalid amount/i);
    });

    it("REJECTS a negative individual line item amountMinor before it can even sum", () => {
        expect(() =>
            resolveAmount({ ...base, lineItems: [{ name: "Refund-as-negative-line-item", amountMinor: -1000 }] })
        ).toThrow(/invalid amountMinor.*-1000/i);
    });

    it("REJECTS a zero individual line item amountMinor", () => {
        expect(() => resolveAmount({ ...base, lineItems: [{ name: "Free item", amountMinor: 0 }] })).toThrow(/invalid amountMinor.*0/i);
    });

    it("REJECTS a negative line item quantity", () => {
        expect(() =>
            resolveAmount({ ...base, lineItems: [{ name: "Widget", amountMinor: 1000, quantity: -2 }] })
        ).toThrow(/invalid quantity.*-2/i);
    });

    it("REJECTS a zero line item quantity", () => {
        expect(() => resolveAmount({ ...base, lineItems: [{ name: "Widget", amountMinor: 1000, quantity: 0 }] })).toThrow(/invalid quantity.*0/i);
    });

    it("REJECTS a non-integer line item quantity", () => {
        expect(() => resolveAmount({ ...base, lineItems: [{ name: "Widget", amountMinor: 1000, quantity: 1.5 }] })).toThrow(/invalid quantity/i);
    });

    it("a negative line item combined with a MATCHING negative amountMinor is still rejected — the per-item check runs before the agreement check", () => {
        // Proves the fix isn't bypassable by making amountMinor "agree"
        // with a maliciously negative lineItems sum.
        expect(() =>
            resolveAmount({ ...base, amountMinor: -1000, lineItems: [{ name: "Bad item", amountMinor: -1000 }] })
        ).toThrow(/invalid amountMinor.*-1000/i);
    });

    it("an empty lineItems array sums to 0 and is rejected by the total-amount check", () => {
        expect(() => resolveAmount({ ...base, lineItems: [] })).toThrow(/invalid amount.*0/i);
    });
});

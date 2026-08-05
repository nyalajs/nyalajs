import { describe, it, expect } from "vitest";
import { flash, consumeFlash, flashValidationErrors, consumeValidationErrors, zodErrorsToInertia } from "../flash";
import { fakeSession } from "./test-helpers";

describe("flash()/consumeFlash() — read-once session flash", () => {
    it("stores and retrieves a flashed value", () => {
        const session = fakeSession();
        flash({ session }, "success", "Saved!");

        expect(consumeFlash({ session })).toEqual({ success: "Saved!" });
    });

    it("clears the flash after it's been read (read-once)", () => {
        const session = fakeSession();
        flash({ session }, "success", "Saved!");

        consumeFlash({ session });
        expect(consumeFlash({ session })).toEqual({});
    });

    it("accumulates multiple keys flashed before the next read", () => {
        const session = fakeSession();
        flash({ session }, "success", "Saved!");
        flash({ session }, "warning", "Careful");

        expect(consumeFlash({ session })).toEqual({ success: "Saved!", warning: "Careful" });
    });

    it("returns an empty object when nothing was flashed", () => {
        const session = fakeSession();
        expect(consumeFlash({ session })).toEqual({});
    });

    it("returns an empty object (doesn't throw) when there's no session at all", () => {
        expect(consumeFlash({})).toEqual({});
    });

    it("throws when flashing without a session enabled", () => {
        expect(() => flash({}, "success", "x")).toThrow(/requires sessions to be enabled/);
    });
});

describe("flashValidationErrors()/consumeValidationErrors()", () => {
    it("stores and retrieves flashed validation errors", () => {
        const session = fakeSession();
        flashValidationErrors({ session }, { email: "Invalid" });

        expect(consumeValidationErrors({ session })).toEqual({ email: "Invalid" });
    });

    it("clears validation errors after they're read (read-once)", () => {
        const session = fakeSession();
        flashValidationErrors({ session }, { email: "Invalid" });

        consumeValidationErrors({ session });
        expect(consumeValidationErrors({ session })).toEqual({});
    });

    it("is a separate channel from generic flash() — doesn't collide with flash keys", () => {
        const session = fakeSession();
        flash({ session }, "email", "This is a flash message, not an error");
        flashValidationErrors({ session }, { email: "This is a validation error" });

        expect(consumeFlash({ session })).toEqual({ email: "This is a flash message, not an error" });
        expect(consumeValidationErrors({ session })).toEqual({ email: "This is a validation error" });
    });

    it("returns an empty object when there's no session", () => {
        expect(consumeValidationErrors({})).toEqual({});
    });

    it("throws when flashing validation errors without a session enabled", () => {
        expect(() => flashValidationErrors({}, { email: "x" })).toThrow(/requires sessions to be enabled/);
    });
});

describe("zodErrorsToInertia()", () => {
    it("converts ZodError-shaped issues into a flat field->message map", () => {
        const result = zodErrorsToInertia({
            issues: [
                { path: ["email"], message: "Invalid email format" },
                { path: ["password"], message: "Too short" },
            ],
        });

        expect(result).toEqual({ email: "Invalid email format", password: "Too short" });
    });

    it("joins nested paths with '.'", () => {
        const result = zodErrorsToInertia({
            issues: [{ path: ["address", "zip"], message: "Required" }],
        });

        expect(result).toEqual({ "address.zip": "Required" });
    });

    it("keeps only the first message per field", () => {
        const result = zodErrorsToInertia({
            issues: [
                { path: ["email"], message: "First error" },
                { path: ["email"], message: "Second error" },
            ],
        });

        expect(result).toEqual({ email: "First error" });
    });

    it("uses '_' as the key for a root-level (empty path) issue", () => {
        const result = zodErrorsToInertia({ issues: [{ path: [], message: "Form-level error" }] });
        expect(result).toEqual({ _: "Form-level error" });
    });
});

import { describe, it, expect } from "vitest";
import { z } from "zod";
import { ValidationPipe } from "../validation.pipe";
import { HttpException, UnprocessableEntityException } from "@nyalajs/http";

describe("ValidationPipe.validate()", () => {
    const schema = z.object({
        email: z.string().email(),
        age: z.number().int().min(0),
    });

    it("returns the parsed data when it's valid", () => {
        const result = ValidationPipe.validate(schema, { email: "a@example.com", age: 30 });
        expect(result).toEqual({ email: "a@example.com", age: 30 });
    });

    it("strips unknown keys not defined on the schema", () => {
        const result = ValidationPipe.validate(schema, { email: "a@example.com", age: 30, extra: "ignored" });
        expect(result).not.toHaveProperty("extra");
    });

    it("throws an UnprocessableEntityException (422 HttpException) when data is invalid", () => {
        expect(() => ValidationPipe.validate(schema, { email: "not-an-email", age: -1 })).toThrow(HttpException);
        expect(() => ValidationPipe.validate(schema, { email: "not-an-email", age: -1 })).toThrow(
            UnprocessableEntityException
        );
    });

    it("maps each Zod issue to a {path, message} entry", () => {
        try {
            ValidationPipe.validate(schema, { email: "not-an-email", age: -1 });
            expect.unreachable("should have thrown");
        } catch (error) {
            const e = error as UnprocessableEntityException;
            expect(e.statusCode).toBe(422);
            expect(e.details).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({ path: "email" }),
                    expect.objectContaining({ path: "age" }),
                ])
            );
        }
    });

    it("joins nested paths with dots", () => {
        const nested = z.object({ user: z.object({ name: z.string() }) });
        try {
            ValidationPipe.validate(nested, { user: {} });
            expect.unreachable("should have thrown");
        } catch (error) {
            expect((error as UnprocessableEntityException).details[0].path).toBe("user.name");
        }
    });

    it("rethrows a non-Zod error unchanged", () => {
        const throwingSchema = {
            parse: () => {
                throw new Error("not a zod error");
            },
        } as any;

        expect(() => ValidationPipe.validate(throwingSchema, {})).toThrow("not a zod error");
    });
});

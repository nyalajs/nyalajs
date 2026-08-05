import { z } from "zod";

/**
 * Auth validators — hand-run via .safeParse() in AuthController rather than
 * the @ValidateBody decorator (see @nyalajs/validation), because a failed
 * @ValidateBody throws straight to FastifyAdapter's exception handler as a
 * JSON 422 (packages/http/src/runtime/fastify-adapter.ts's validateRequest()),
 * which isn't the real Inertia validation pattern. Inertia forms expect a
 * redirect back to the same page with `props.errors` populated (see
 * packages/inertia/src/flash.ts's flashValidationErrors()/zodErrorsToInertia()
 * doc comment) — that round trip needs the controller to catch the
 * validation failure itself, not have it thrown past it.
 */
export const RegisterValidator = z.object({
    name: z.string().min(2, "Name must be at least 2 characters").max(255),
    email: z.string().email("Invalid email format").max(255),
    password: z
        .string()
        .min(8, "Password must be at least 8 characters")
        .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
        .regex(/[a-z]/, "Password must contain at least one lowercase letter")
        .regex(/[0-9]/, "Password must contain at least one number"),
});

export type RegisterDto = z.infer<typeof RegisterValidator>;

export const LoginValidator = z.object({
    email: z.string().email("Invalid email format"),
    password: z.string().min(1, "Password is required"),
});

export type LoginDto = z.infer<typeof LoginValidator>;

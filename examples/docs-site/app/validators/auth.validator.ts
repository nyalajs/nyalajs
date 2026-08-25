import { z } from "zod";

/**
 * Single-field admin login validator — hand-run via .safeParse() in
 * AuthController, same "not @ValidateBody" reasoning as DocValidator (see
 * that file's doc comment): a failed @ValidateBody throws straight to a
 * JSON 422, not the real Inertia flash+303-redirect round trip.
 */
export const AdminLoginValidator = z.object({
    password: z.string().min(1, "Password is required"),
});

export type AdminLoginDto = z.infer<typeof AdminLoginValidator>;

import { z } from "zod";

/** Same hand-run .safeParse() pattern as auth.validator.ts — see its doc comment for why. */
export const ProfileValidator = z.object({
    name: z.string().min(2, "Name must be at least 2 characters").max(255),
});

export type ProfileDto = z.infer<typeof ProfileValidator>;

export const ChangePasswordValidator = z.object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: z
        .string()
        .min(8, "Password must be at least 8 characters")
        .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
        .regex(/[a-z]/, "Password must contain at least one lowercase letter")
        .regex(/[0-9]/, "Password must contain at least one number"),
});

export type ChangePasswordDto = z.infer<typeof ChangePasswordValidator>;

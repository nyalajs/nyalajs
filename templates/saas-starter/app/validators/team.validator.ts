import { z } from "zod";

export const InviteMemberValidator = z.object({
    email: z.string().email("Invalid email format"),
    role: z.enum(["admin", "member"]).optional().default("member"),
});

export const AcceptInviteValidator = z.object({
    token: z.string().min(1, "Token is required"),
    name: z.string().min(2, "Name must be at least 2 characters").max(255),
    password: z
        .string()
        .min(8, "Password must be at least 8 characters")
        .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
        .regex(/[a-z]/, "Password must contain at least one lowercase letter")
        .regex(/[0-9]/, "Password must contain at least one number"),
});

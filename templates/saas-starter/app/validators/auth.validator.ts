import { z } from "zod";

export const RegisterValidator = z.object({
    tenantName: z.string().min(2, "Workspace name must be at least 2 characters").max(255),
    name: z.string().min(2, "Name must be at least 2 characters").max(255),
    email: z.string().email("Invalid email format").max(255),
    password: z
        .string()
        .min(8, "Password must be at least 8 characters")
        .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
        .regex(/[a-z]/, "Password must contain at least one lowercase letter")
        .regex(/[0-9]/, "Password must contain at least one number"),
});

export const LoginValidator = z.object({
    email: z.string().email("Invalid email format"),
    password: z.string().min(1, "Password is required"),
    tenantSlug: z.string().optional(),
});

export const ForgotPasswordValidator = z.object({
    email: z.string().email("Invalid email format"),
});

export const ResetPasswordValidator = z.object({
    token: z.string().min(1, "Token is required"),
    newPassword: z
        .string()
        .min(8, "Password must be at least 8 characters")
        .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
        .regex(/[a-z]/, "Password must contain at least one lowercase letter")
        .regex(/[0-9]/, "Password must contain at least one number"),
});

export const ChangePasswordValidator = z.object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: z
        .string()
        .min(8, "Password must be at least 8 characters")
        .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
        .regex(/[a-z]/, "Password must contain at least one lowercase letter")
        .regex(/[0-9]/, "Password must contain at least one number"),
});

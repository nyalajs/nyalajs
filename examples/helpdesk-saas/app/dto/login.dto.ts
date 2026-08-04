/**
 * Login DTO
 */
export class LoginDto {
    email!: string;
    password!: string;
    tenantSlug?: string; // Optional: for tenant identification
}

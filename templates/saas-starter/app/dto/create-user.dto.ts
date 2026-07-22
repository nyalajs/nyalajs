/**
 * Create User DTO
 *
 * Data Transfer Object for creating a new user in a multi-tenant context.
 */
export class CreateUserDto {
    name!: string;
    email!: string;
    password!: string;
    role?: string;
    isActive?: boolean;
}

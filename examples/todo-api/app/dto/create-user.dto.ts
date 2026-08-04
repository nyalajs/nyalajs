/**
 * Create User DTO
 *
 * Data Transfer Object for creating a new user.
 * Used for type safety when passing data between layers.
 */
export class CreateUserDto {
    name!: string;
    email!: string;
    password!: string;
    isActive?: boolean;
}

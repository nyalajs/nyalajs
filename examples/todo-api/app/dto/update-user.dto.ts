/**
 * Update User DTO
 *
 * Data Transfer Object for updating an existing user.
 * All fields are optional since partial updates are allowed.
 */
export class UpdateUserDto {
    name?: string;
    email?: string;
    password?: string;
    isActive?: boolean;
}

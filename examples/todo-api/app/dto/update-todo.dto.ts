/**
 * Update Todo DTO
 *
 * Data Transfer Object for updating an existing todo.
 * All fields are optional since partial updates are allowed.
 */
export class UpdateTodoDto {
    title?: string;
    description?: string;
    completed?: boolean;
    dueDate?: string;
}

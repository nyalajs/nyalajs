/**
 * Create Todo DTO
 *
 * Data Transfer Object for creating a new todo.
 * Used for type safety when passing data between layers.
 */
export class CreateTodoDto {
    title!: string;
    description?: string;
    dueDate?: string;
}

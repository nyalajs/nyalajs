import { Injectable } from "@nyalajs/core";
import { Logger } from "@nyalajs/observability";
import { TodoRepository } from "../repositories/todo.repository";
import { CreateTodoDto } from "../dto/create-todo.dto";
import { UpdateTodoDto } from "../dto/update-todo.dto";
import { Todo } from "../models/todo.model";

/**
 * Todos Service
 *
 * Business logic layer for todo management. Every method is scoped to
 * a userId so a caller can only ever see or mutate their own todos.
 */
@Injectable()
export class TodosService {
    constructor(
        private readonly todoRepository: TodoRepository,
        private readonly logger: Logger
    ) { }

    /**
     * Get all todos owned by a user, with pagination
     */
    async findAll(userId: string, page: number = 1, limit: number = 10): Promise<{
        data: Todo[];
        pagination: {
            page: number;
            limit: number;
            total: number;
            totalPages: number;
        };
    }> {
        const offset = (page - 1) * limit;
        const todos = await this.todoRepository.findAllForUser(userId, { limit, offset });
        const total = await this.todoRepository.countForUser(userId);

        this.logger.info("Todos retrieved", { userId, page, limit, total });

        return {
            data: todos,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            },
        };
    }

    /**
     * Get a single todo by ID, scoped to its owner
     */
    async findOne(id: string, userId: string): Promise<Todo | null> {
        const todo = await this.todoRepository.findByIdForUser(id, userId);

        if (!todo) {
            this.logger.warn("Todo not found", { id, userId });
            return null;
        }

        return todo;
    }

    /**
     * Create a new todo owned by userId
     */
    async create(userId: string, dto: CreateTodoDto): Promise<Todo> {
        const todo = await this.todoRepository.create({
            ...dto,
            userId,
            dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        } as Partial<Todo>);

        this.logger.info("Todo created", { todoId: todo.id, userId });

        return todo;
    }

    /**
     * Update a todo, scoped to its owner
     */
    async update(id: string, userId: string, dto: UpdateTodoDto): Promise<Todo | null> {
        const updated = await this.todoRepository.updateForUser(id, userId, {
            ...dto,
            dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        } as Partial<Todo>);

        if (!updated) {
            this.logger.warn("Todo not found for update", { id, userId });
            return null;
        }

        this.logger.info("Todo updated", { todoId: id, userId });

        return updated;
    }

    /**
     * Mark a todo as complete (or toggle it), scoped to its owner
     */
    async setCompleted(id: string, userId: string, completed: boolean = true): Promise<Todo | null> {
        const updated = await this.todoRepository.updateForUser(id, userId, { completed } as Partial<Todo>);

        if (!updated) {
            this.logger.warn("Todo not found for completion", { id, userId });
            return null;
        }

        this.logger.info("Todo completion updated", { todoId: id, userId, completed });

        return updated;
    }

    /**
     * Delete a todo, scoped to its owner
     */
    async delete(id: string, userId: string): Promise<boolean> {
        const deleted = await this.todoRepository.deleteForUser(id, userId);

        if (deleted) {
            this.logger.info("Todo deleted", { todoId: id, userId });
        } else {
            this.logger.warn("Todo not found for deletion", { id, userId });
        }

        return deleted;
    }
}

import { Controller, Get, Post, Put, Patch, Delete, Body, Param, Query, Headers } from "@nyalajs/core";
import { ValidateBody, ValidateQuery } from "@nyalajs/validation";
import { TodosService } from "../services/todos.service";
import { AuthService } from "../services/auth.service";
import { CreateTodoDto } from "../dto/create-todo.dto";
import { UpdateTodoDto } from "../dto/update-todo.dto";
import { CreateTodoValidator, UpdateTodoValidator, TodoPaginationValidator } from "../validators/todo.validator";

/**
 * Todos Controller
 *
 * Handles HTTP requests for the authenticated user's todos.
 * Delegates business logic to TodosService. Every route requires a
 * valid Bearer token; the caller's user ID is resolved from it and
 * every lookup/mutation is scoped to that user.
 */
@Controller("/todos")
export class TodosController {
    constructor(
        private readonly todosService: TodosService,
        private readonly authService: AuthService
    ) { }

    /**
     * Resolve the authenticated user's ID from the Authorization header.
     * Mirrors AuthController.me() — this app has no guard infrastructure
     * wired up, so token verification happens here, per-request.
     */
    private getUserId(authorization: string | undefined): string {
        if (!authorization || !authorization.startsWith("Bearer ")) {
            throw new Error("Unauthorized");
        }

        const token = authorization.substring(7);
        const payload = this.authService.verifyToken(token);

        return payload.sub;
    }

    /**
     * GET /todos
     * List the caller's own todos with pagination
     */
    @Get("/")
    @ValidateQuery(TodoPaginationValidator)
    async index(
        @Headers("authorization") authorization: string,
        @Query("page") page: number = 1,
        @Query("limit") limit: number = 10
    ) {
        try {
            const userId = this.getUserId(authorization);
            const { data, pagination } = await this.todosService.findAll(userId, page, limit);

            return { data, pagination };
        } catch (error: any) {
            return {
                statusCode: 401,
                message: error.message,
            };
        }
    }

    /**
     * GET /todos/:id
     * Get one of the caller's own todos by ID
     */
    @Get("/:id")
    async show(@Headers("authorization") authorization: string, @Param("id") id: string) {
        try {
            const userId = this.getUserId(authorization);
            const todo = await this.todosService.findOne(id, userId);

            if (!todo) {
                return {
                    statusCode: 404,
                    message: "Todo not found",
                };
            }

            return {
                statusCode: 200,
                data: todo,
            };
        } catch (error: any) {
            return {
                statusCode: 401,
                message: error.message,
            };
        }
    }

    /**
     * POST /todos
     * Create a new todo owned by the caller
     */
    @Post("/")
    @ValidateBody(CreateTodoValidator)
    async create(@Headers("authorization") authorization: string, @Body() dto: CreateTodoDto) {
        try {
            const userId = this.getUserId(authorization);
            const todo = await this.todosService.create(userId, dto);

            return {
                statusCode: 201,
                message: "Todo created successfully",
                data: todo,
            };
        } catch (error: any) {
            return {
                statusCode: error.message === "Unauthorized" ? 401 : 400,
                message: error.message,
            };
        }
    }

    /**
     * PUT /todos/:id
     * Update one of the caller's own todos
     */
    @Put("/:id")
    @ValidateBody(UpdateTodoValidator)
    async update(
        @Headers("authorization") authorization: string,
        @Param("id") id: string,
        @Body() dto: UpdateTodoDto
    ) {
        try {
            const userId = this.getUserId(authorization);
            const todo = await this.todosService.update(id, userId, dto);

            if (!todo) {
                return {
                    statusCode: 404,
                    message: "Todo not found",
                };
            }

            return {
                statusCode: 200,
                message: "Todo updated successfully",
                data: todo,
            };
        } catch (error: any) {
            return {
                statusCode: error.message === "Unauthorized" ? 401 : 400,
                message: error.message,
            };
        }
    }

    /**
     * PATCH /todos/:id/complete
     * Mark one of the caller's own todos as complete (or incomplete)
     */
    @Patch("/:id/complete")
    async complete(
        @Headers("authorization") authorization: string,
        @Param("id") id: string,
        @Body() body?: { completed?: boolean }
    ) {
        try {
            const userId = this.getUserId(authorization);
            const todo = await this.todosService.setCompleted(id, userId, body?.completed ?? true);

            if (!todo) {
                return {
                    statusCode: 404,
                    message: "Todo not found",
                };
            }

            return {
                statusCode: 200,
                message: "Todo updated successfully",
                data: todo,
            };
        } catch (error: any) {
            return {
                statusCode: error.message === "Unauthorized" ? 401 : 400,
                message: error.message,
            };
        }
    }

    /**
     * DELETE /todos/:id
     * Delete one of the caller's own todos
     */
    @Delete("/:id")
    async destroy(@Headers("authorization") authorization: string, @Param("id") id: string) {
        try {
            const userId = this.getUserId(authorization);
            const deleted = await this.todosService.delete(id, userId);

            if (!deleted) {
                return {
                    statusCode: 404,
                    message: "Todo not found",
                };
            }

            return {
                statusCode: 200,
                message: "Todo deleted successfully",
            };
        } catch (error: any) {
            return {
                statusCode: 401,
                message: error.message,
            };
        }
    }
}

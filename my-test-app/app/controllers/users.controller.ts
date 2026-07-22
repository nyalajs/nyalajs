import { Controller, Get, Post, Put, Delete, Body, Param, Query } from "@nyalajs/core";
import { UseValidation } from "@nyalajs/validation";
import { UsersService } from "../services/users.service";
import { CreateUserDto } from "../dto/create-user.dto";
import { UpdateUserDto } from "../dto/update-user.dto";
import { CreateUserValidator, UpdateUserValidator, PaginationValidator } from "../validators/user.validator";

/**
 * Users Controller
 *
 * Handles HTTP requests for user management.
 * Delegates business logic to UsersService.
 */
@Controller("/users")
export class UsersController {
    constructor(private readonly usersService: UsersService) { }

    /**
     * GET /users
     * List all users with pagination
     */
    @Get("/")
    @UseValidation(PaginationValidator, "query")
    async index(@Query("page") page: number = 1, @Query("limit") limit: number = 10) {
        return this.usersService.findAll(page, limit);
    }

    /**
     * GET /users/:id
     * Get user by ID
     */
    @Get("/:id")
    async show(@Param("id") id: string) {
        const user = await this.usersService.findOne(id);

        if (!user) {
            return {
                const { password, ...userWithoutPassword } = user;

                return {
                    statusCode: 201,
                    message: "User created successfully",
                    data: userWithoutPassword,
                };
            } catch (error: any) {
                return {
                    statusCode: 400,
                    message: error.message,
                };
            }
        }

        /**
         * PUT /users/:id
         * Update user
         */
        @Put("/:id")
        @UseValidation(UpdateUserValidator)
        async update(@Param("id") id: string, @Body() dto: UpdateUserDto) {
            try {
                const user = await this.usersService.update(id, dto);

                if (!user) {
                    return {
                        statusCode: 404,
                        message: "User not found",
                    };
                }

                // Remove password from response
                const { password, ...userWithoutPassword } = user;

                return {
                    statusCode: 200,
                    message: "User updated successfully",
                    data: userWithoutPassword,
                };
            } catch (error: any) {
                return {
                    statusCode: 400,
                    message: error.message,
                };
            }
        }

        /**
         * DELETE /users/:id
         * Delete user
         */
        @Delete("/:id")
        async destroy(@Param("id") id: string) {
            const deleted = await this.usersService.delete(id);

            if (!deleted) {
                return {
                    statusCode: 404,
                    message: "User not found",
                };
            }

            return {
                statusCode: 200,
                message: "User deleted successfully",
            };
        }
    }

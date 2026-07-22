import { Injectable } from "@nyala/core";
import { Logger } from "@nyala/observability";
import { UserRepository } from "../repositories/user.repository";
import { CreateUserDto } from "../dto/create-user.dto";
import { UpdateUserDto } from "../dto/update-user.dto";
import { User } from "../models/user.model";
import { hashPassword } from "../helpers/password.helper";

/**
 * Users Service
 *
 * Business logic layer for user management.
 * Coordinates between controller and repository layers.
 */
@Injectable()
export class UsersService {
    constructor(
        private readonly userRepository: UserRepository,
        private readonly logger: Logger
    ) { }

    /**
     * Get all users with pagination
     */
    async findAll(page: number = 1, limit: number = 10): Promise<{
        data: User[];
        pagina             totalPages: Math.ceil(total / limit),
            },
        };
    }

    /**
     * Get user by ID
     */
    async findOne(id: string): Promise < User | null > {
    const user = await this.userRepository.findById(id);

    if(!user) {
        this.logger.warn("User not found", { id });
        return null;
    }

        return user;
}

    /**
     * Create new user
     */
    async create(dto: CreateUserDto): Promise < User > {
    // Check if email already exists
    const exists = await this.userRepository.emailExists(dto.email);
    if(exists) {
        this.logger.warn("Email already exists", { email: dto.email });
        throw new Error("Email already exists");
    }

        // Hash password
        const hashedPassword = await hashPassword(dto.password);

    // Create user
    const user = await this.userRepository.create({
        ...dto,
        password: hashedPassword,
    });

    this.logger.info("User created", { userId: user.id, email: user.email });

    return user;
}

    /**
     * Update user
     */
    async update(id: string, dto: UpdateUserDto): Promise < User | null > {
    const user = await this.userRepository.findById(id);
    if(!user) {
        this.logger.warn("User not found for update", { id });
        return null;
    }

        // If email is being updated, check if it's already taken
        if(dto.email && dto.email !== user.email) {
    const exists = await this.userRepository.emailExists(dto.email);
    if (exists) {
        this.logger.warn("Email already exists", { email: dto.email });
        throw new Error("Email already exists");
    }
}

// If password is being updated, hash it
if (dto.password) {
    dto.password = await hashPassword(dto.password);
}

const updated = await this.userRepository.update(id, dto);

this.logger.info("User updated", { userId: id });

return updated;
    }

    /**
     * Delete user
     */
    async delete (id: string): Promise < boolean > {
    const user = await this.userRepository.findById(id);
    if(!user) {
        this.logger.warn("User not found for deletion", { id });
        return false;
    }

        const deleted = await this.userRepository.delete(id);

    if(deleted) {
        this.logger.info("User deleted", { userId: id });
    }

        return deleted;
}

    /**
     * Find user by email
     */
    async findByEmail(email: string): Promise < User | null > {
    return this.userRepository.findByEmail(email);
}
}

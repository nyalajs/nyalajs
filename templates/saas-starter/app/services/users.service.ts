import { Injectable } from "@nyalajs/core";
import { ConflictException, NotFoundException } from "@nyalajs/http";
import { Logger } from "@nyalajs/observability";
import { UserRepository } from "../repositories/user.repository";
import { hashPassword } from "../helpers/password.helper";
import type { User, PublicUser } from "../models/user.model";

export interface CreateUserDto {
    email: string;
    name: string;
    password: string;
    role?: string;
}

export interface UpdateUserDto {
    name?: string;
    email?: string;
    role?: string;
}

export interface PaginationOptions {
    page: number;
    limit: number;
}

@Injectable()
export class UsersService {
    constructor(
        private readonly logger: Logger,
        private readonly userRepository: UserRepository
    ) {}

    /** Every user in the CURRENT tenant (TenantContext-scoped via UserRepository), paginated. */
    async findAll(options: PaginationOptions): Promise<{ data: PublicUser[]; pagination: PaginationOptions & { total: number; totalPages: number } }> {
        this.logger.info("Finding all users", options);

        const offset = (options.page - 1) * options.limit;
        const [rows, total] = await Promise.all([
            this.userRepository.findAll({ limit: options.limit, offset }),
            this.userRepository.count(),
        ]);

        return {
            data: rows.map(this.sanitize),
            pagination: {
                page: options.page,
                limit: options.limit,
                total,
                totalPages: Math.max(1, Math.ceil(total / options.limit)),
            },
        };
    }

    async findOne(id: string): Promise<PublicUser> {
        this.logger.info("Finding user", { id });

        const user = await this.userRepository.findById(id);
        if (!user) {
            throw new NotFoundException("User not found");
        }
        return this.sanitize(user);
    }

    async create(dto: CreateUserDto): Promise<PublicUser> {
        this.logger.info("Creating user", { email: dto.email });

        const existing = await this.userRepository.findByEmail(dto.email.toLowerCase());
        if (existing) {
            throw new ConflictException("A user with this email already exists in this workspace.");
        }

        const passwordHash = await hashPassword(dto.password);
        const user = await this.userRepository.create({
            email: dto.email.toLowerCase(),
            name: dto.name,
            password: passwordHash,
            role: dto.role ?? "member",
            isActive: true,
        } as any);

        return this.sanitize(user);
    }

    async update(id: string, dto: UpdateUserDto): Promise<PublicUser> {
        this.logger.info("Updating user", { id });

        const existing = await this.userRepository.findById(id);
        if (!existing) {
            throw new NotFoundException("User not found");
        }

        if (dto.email && dto.email.toLowerCase() !== existing.email) {
            const emailTaken = await this.userRepository.findByEmail(dto.email.toLowerCase());
            if (emailTaken) {
                throw new ConflictException("A user with this email already exists in this workspace.");
            }
        }

        const updated = await this.userRepository.update(id, {
            ...(dto.name !== undefined && { name: dto.name }),
            ...(dto.email !== undefined && { email: dto.email.toLowerCase() }),
            ...(dto.role !== undefined && { role: dto.role }),
        } as Partial<User>);

        return this.sanitize(updated!);
    }

    async delete(id: string): Promise<{ message: string }> {
        this.logger.info("Deleting user", { id });

        const existing = await this.userRepository.findById(id);
        if (!existing) {
            throw new NotFoundException("User not found");
        }

        await this.userRepository.deactivate(id);
        return { message: `User ${id} deleted successfully` };
    }

    private sanitize(user: User): PublicUser {
        const { password, ...sanitized } = user;
        return sanitized;
    }
}

import "reflect-metadata";
import { describe, it, expect, beforeEach } from "vitest";
import { Logger } from "@nyalajs/observability";
import { AuthService } from "../../app/services/auth.service";
import { hashPassword } from "../../app/helpers/password.helper";
import { User } from "../../app/models/user.model";

/** In-memory fake of UserRepository — same convention as posts.service.spec.ts. */
class FakeUserRepository {
    private rows: User[] = [];
    private nextId = 1;

    async findByEmail(email: string): Promise<User | null> {
        return this.rows.find((r) => r.email === email) ?? null;
    }

    async emailExists(email: string): Promise<boolean> {
        return this.rows.some((r) => r.email === email);
    }

    async createUser(data: Omit<User, "id" | "createdAt" | "updatedAt">): Promise<User> {
        const now = new Date();
        const row = { id: `user-${this.nextId++}`, createdAt: now, updatedAt: now, ...data } as User;
        this.rows.push(row);
        return row;
    }
}

describe("AuthService", () => {
    let repo: FakeUserRepository;
    let service: AuthService;

    beforeEach(() => {
        repo = new FakeUserRepository();
        service = new AuthService(repo as any, new Logger("test"));
    });

    describe("register", () => {
        it("creates a new user with a hashed password", async () => {
            const user = await service.register({ name: "Ada", email: "ada@example.com", password: "Password123" });

            expect(user.email).toBe("ada@example.com");
            expect(user.password).not.toBe("Password123");
        });

        it("throws when the email is already taken", async () => {
            await service.register({ name: "Ada", email: "ada@example.com", password: "Password123" });

            await expect(
                service.register({ name: "Ada 2", email: "ada@example.com", password: "Password123" })
            ).rejects.toThrow("Email already in use");
        });
    });

    describe("verify", () => {
        it("returns the user when credentials are correct", async () => {
            await service.register({ name: "Ada", email: "ada@example.com", password: "Password123" });

            const user = await service.verify("ada@example.com", "Password123");
            expect(user?.email).toBe("ada@example.com");
        });

        it("returns null when the password is wrong", async () => {
            await service.register({ name: "Ada", email: "ada@example.com", password: "Password123" });

            const user = await service.verify("ada@example.com", "WrongPassword1");
            expect(user).toBeNull();
        });

        it("returns null when the email doesn't exist", async () => {
            const user = await service.verify("nobody@example.com", "Password123");
            expect(user).toBeNull();
        });

        it("returns null for a deactivated user", async () => {
            const hashed = await hashPassword("Password123");
            await repo.createUser({
                name: "Inactive",
                email: "inactive@example.com",
                password: hashed,
                isActive: false,
                emailVerifiedAt: null,
            } as any);

            const user = await service.verify("inactive@example.com", "Password123");
            expect(user).toBeNull();
        });
    });
});

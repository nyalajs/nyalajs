import { Injectable } from "@nyalajs/core";
import { UserRepository } from "../repositories/user.repository";
import { User } from "../models/user.model";
import { comparePassword } from "../helpers/password.helper";

@Injectable()
export class AuthService {
    constructor(private readonly userRepository: UserRepository) {}

    /** Verifies email/password for the login form. Returns null on any failure. */
    async verify(email: string, password: string): Promise<User | null> {
        const user = await this.userRepository.findByEmail(email);
        if (!user) return null;

        const valid = await comparePassword(password, user.password);
        return valid ? user : null;
    }
}

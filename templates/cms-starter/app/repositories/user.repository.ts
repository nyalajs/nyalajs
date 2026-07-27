import { Injectable } from "@nyalajs/core";
import { eq } from "drizzle-orm";
import { BaseRepository } from "./base.repository";
import { users, User } from "../models/user.model";

@Injectable()
export class UserRepository extends BaseRepository<User> {
    constructor() {
        super(users);
    }

    async findByEmail(email: string): Promise<User | null> {
        return this.findOne(eq(users.email, email));
    }

    async emailExists(email: string): Promise<boolean> {
        return (await this.findByEmail(email)) !== null;
    }
}

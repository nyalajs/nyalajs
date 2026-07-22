import { Injectable } from "@nyalajs/core";
import * as bcrypt from "bcrypt";

@Injectable()
export class HashingService {
    private readonly saltRounds: number = 10;

    /**
     * Hash a plain-text password using bcrypt.
     */
    async hash(plainText: string): Promise<string> {
        return await bcrypt.hash(plainText, this.saltRounds);
    }

    /**
     * Compare a plain-text password against a hashed password.
     */
    async compare(plainText: string, hash: string): Promise<boolean> {
        return await bcrypt.compare(plainText, hash);
    }
}

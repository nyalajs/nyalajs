import jwt from "jsonwebtoken";
import { Injectable } from "@nyalajs/core";

export interface UserIdentity {
    userId: string;
    roles: string[];
    permissions: string[];
    tenantId?: string;
    metadata: Record<string, any>;
}

export interface JwtPayload {
    sub: string;
    roles?: string[];
    permissions?: string[];
    tenantId?: string;
    [key: string]: any;
}

export interface JwtStrategyOptions {
    secret: string;
    expiresIn?: string;
    issuer?: string;
    audience?: string;
}

@Injectable()
export class JwtStrategy {
    constructor(private readonly options: JwtStrategyOptions) { }

    async authenticate(token: string): Promise<UserIdentity | null> {
        try {
            const payload = jwt.verify(token, this.options.secret, {
                issuer: this.options.issuer,
                audience: this.options.audience,
            }) as JwtPayload;

            return {
                userId: payload.sub,
                roles: payload.roles ?? [],
                permissions: payload.permissions ?? [],
                tenantId: payload.tenantId,
                metadata: payload,
            };
        } catch (error) {
            return null;
        }
    }

    sign(payload: JwtPayload, optionsOverride?: Partial<jwt.SignOptions>): string {
        return jwt.sign(payload, this.options.secret, {
            expiresIn: (this.options.expiresIn ?? "1h") as any,
            issuer: this.options.issuer,
            audience: this.options.audience,
            ...optionsOverride
        });
    }

    verify(token: string): JwtPayload | null {
        try {
            return jwt.verify(token, this.options.secret) as JwtPayload;
        } catch {
            return null;
        }
    }
}

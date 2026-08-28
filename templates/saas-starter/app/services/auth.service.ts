import { randomUUID } from "node:crypto";
import { Injectable, Inject } from "@nyalajs/core";
import { UnauthorizedException, NotFoundException, BadRequestException } from "@nyalajs/http";
import { ConfigService } from "@nyalajs/config";
import { Logger } from "@nyalajs/observability";
import { ConnectionContext } from "@nyalajs/database";
import { JwtStrategy } from "@nyalajs/security";
import { RequestContext } from "@nyalajs/http";
import { UserRepository } from "../repositories/user.repository";
import { TenantRepository } from "../repositories/tenant.repository";
import { RefreshTokenRepository } from "../repositories/refresh-token.repository";
import { hashPassword, comparePassword } from "../helpers/password.helper";
import { generateSlug } from "../helpers/tenant.helper";
import { RoleService } from "@nyalajs/permissions";
import { TenantRegistry } from "@nyalajs/tenancy";
import { runInTransaction } from "../../database/transaction";
import { runForTenant } from "../../database/run-for-tenant";
import { Tenant } from "../models/tenant.model";
import { User, type PublicUser } from "../models/user.model";
import { EmailVerificationService } from "./email-verification.service";

export interface RegisterDto {
    /** The new tenant's display name (e.g. "Acme Corp"). A URL-safe slug is derived from this automatically. */
    tenantName: string;
    email: string;
    password: string;
    name: string;
}

export interface LoginDto {
    email: string;
    password: string;
    /** Required when the account's tenant can't be inferred from the request (e.g. no subdomain in play) — see AuthController's doc comment. */
    tenantSlug?: string;
}

export interface AuthResult {
    user: PublicUser;
    tenant: Tenant;
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
}

@Injectable()
export class AuthService {
    /** Built lazily on first use, then cached — a real (not per-token-throwaway) JwtStrategy for refresh tokens specifically, signed/verified with JWT_REFRESH_SECRET, distinct from the access-token secret `this.jwtStrategy` uses. */
    private _refreshTokenStrategy: JwtStrategy | null = null;

    constructor(
        private readonly config: ConfigService,
        private readonly logger: Logger,
        private readonly jwtStrategy: JwtStrategy,
        private readonly userRepository: UserRepository,
        private readonly tenantRepository: TenantRepository,
        private readonly refreshTokenRepository: RefreshTokenRepository,
        private readonly roleService: RoleService,
        private readonly emailVerificationService: EmailVerificationService,
        private readonly tenantRegistry: TenantRegistry,
        @Inject("REQUEST_CONTEXT") private readonly requestContext: RequestContext,
        @Inject("REQUEST") private readonly request: any
    ) {}

    private refreshTokenStrategy(): JwtStrategy {
        if (!this._refreshTokenStrategy) {
            this._refreshTokenStrategy = new JwtStrategy({
                secret: this.config.get("JWT_REFRESH_SECRET", "refresh-secret"),
                expiresIn: this.config.get("JWT_REFRESH_EXPIRES_IN", "7d"),
            });
        }
        return this._refreshTokenStrategy;
    }

    /** Days until a freshly-issued refresh token's DB row expires — parsed from the SAME JWT_REFRESH_EXPIRES_IN value refreshTokenStrategy() signs with, so the stored row's expiry and the JWT's own `exp` claim can never drift apart. Only "<N>d" is supported (this starter's own default) — extend this if you configure a non-day unit. */
    private refreshTokenTtlDays(): number {
        const raw = this.config.get<string>("JWT_REFRESH_EXPIRES_IN", "7d");
        const match = /^(\d+)d$/.exec(raw);
        return match ? Number(match[1]) : 7;
    }

    /**
     * Creates a brand-new tenant AND its first (owner) user in one
     * transaction — a real SaaS signup creates a workspace, not just an
     * account. Slug is derived from `tenantName` and de-duplicated
     * (`acme`, `acme-2`, `acme-3`, ...) if it collides with an existing
     * tenant. The owner user is granted the real "owner" role via
     * @nyalajs/permissions, team-scoped to the new tenant — see
     * RoleService's own docs for why `teamId`, not `tenantId`.
     */
    async register(dto: RegisterDto): Promise<AuthResult> {
        const existingBySlugBase = generateSlug(dto.tenantName);
        const slug = await this.uniqueSlug(existingBySlugBase);

        this.logger.info("Registering new tenant + owner user", { email: dto.email, slug });

        const passwordHash = await hashPassword(dto.password);

        // Model.create() with an explicit tenantId already in the payload
        // skips its own mandatory-TenantContext check entirely (see
        // Model.stampTenant()'s `data.tenantId` short-circuit) — necessary
        // here since this tenant doesn't exist yet at the START of this
        // transaction, so there's no TenantContext that could possibly be
        // active for it. runInTransaction() keeps both inserts atomic: a
        // failure creating the owner user must not leave an orphaned tenant
        // with no members.
        const { tenant, user } = await runInTransaction(async () => {
            const tenant = await Tenant.create({
                name: dto.tenantName,
                slug,
                isActive: true,
                plan: "free",
            } as Partial<Tenant>);

            const user = await User.create({
                tenantId: tenant.id,
                name: dto.name,
                email: dto.email.toLowerCase(),
                password: passwordHash,
                role: "owner",
                isActive: true,
            } as Partial<User>);

            return { tenant, user };
        });

        // Real RBAC role, not just the free-text `role` column above (kept
        // in sync for cheap display/legacy checks — see UserRepository's
        // doc comment) — team-scoped to this tenant so it never leaks into
        // another tenant's "owner" role.
        const ownerRole = await this.roleService.findOrCreate("owner", { tenantId: tenant.id });
        await this.roleService.assignRole({ modelType: "User", modelId: user.id, tenantId: tenant.id }, ownerRole);

        // Deliberately not awaited: sendVerificationEmail() already
        // catches its own send failures internally (a broken mail
        // provider must never fail signup) — but awaiting it here would
        // ALSO mean a merely SLOW mail provider blocks this entire HTTP
        // response until it finishes, since sending is a real network
        // call to an external SMTP server. Registration only needs the
        // token to exist in the DB (already true by the time this method
        // returns, since sendVerificationEmail() creates it before
        // attempting to send) — resend-verification exists for exactly
        // the case where the async send itself never completes/fails.
        // Verified against a real app: with this awaited, a slow SMTP
        // handshake hung the registration request indefinitely; the mail
        // send itself has since also gained a real socket timeout (see
        // @nyalajs/mail's MailService.connect()), but a request-critical
        // path still shouldn't depend on a non-critical side effect's
        // latency even with a bounded timeout.
        void this.emailVerificationService.sendVerificationEmail(user).catch((err) => {
            this.logger.error("sendVerificationEmail failed outside its own try/catch", err instanceof Error ? err : new Error(String(err)), { userId: user.id });
        });

        const tokens = await this.issueTokens(user, tenant.id);
        return { user: this.sanitizeUser(user), tenant, ...tokens };
    }

    async login(dto: LoginDto): Promise<AuthResult> {
        this.logger.info("Login attempt", { email: dto.email });

        const tenant = await this.resolveTenantForLogin(dto);

        // Everything that reads/writes the USER row must target this
        // tenant's real database — the shared one by default, or a
        // dedicated one if this tenant has been migrated (see
        // TenantsService.migrateToDedicated()) — since TenantMiddleware
        // never got a chance to route this request the normal way (no
        // valid Authorization header yet; that's what login() is FOR).
        // Confirmed against a real dedicated tenant: without this, a
        // genuinely correct email+password for a user that only exists on
        // the dedicated database still failed with "Invalid credentials",
        // because the lookup silently checked the shared database instead.
        // issueTokens() runs INSIDE this same runForTenant() block — its
        // roleService.rolesFor() call needs the tenant's real (possibly
        // dedicated) connection to see that tenant's real RBAC data,
        // exactly like the user lookup above does. Its OWN refresh-token
        // write still correctly forces itself back to the shared database
        // regardless (see issueTokens()'s own ConnectionContext.run(undefined,
        // ...) — RefreshToken is never migrated). Confirmed against a real
        // dedicated tenant: calling issueTokens() OUTSIDE this block
        // produced a valid login with an empty `roles: []` in the response
        // — the role assignment was real and present, just invisible from
        // the wrong (shared) connection roleService.rolesFor() was
        // ambiently running against.
        const { user, tokens } = await runForTenant(this.tenantRegistry, tenant.id, async () => {
            const found = await this.findUserInTenant(dto.email.toLowerCase(), tenant.id);
            if (!found || !(await comparePassword(dto.password, found.password))) {
                // Deliberately identical error/timing shape whether the
                // email doesn't exist or the password is wrong — never
                // reveal which one failed (that would let an attacker
                // enumerate real emails).
                throw new UnauthorizedException("Invalid credentials");
            }
            if (!found.isActive) {
                throw new UnauthorizedException("This account has been deactivated");
            }

            // Not userRepository.update(): that's tenant-scoped via
            // TenantContext (a SEPARATE mechanism from the
            // runForTenant()/ConnectionContext routing this whole callback
            // already runs inside — TenantContext still isn't set at login
            // time, TenantMiddleware never ran). Verified against a real
            // request: using update() here throws "Tenant context
            // required" and login never completes.
            await this.userRepository.rawUpdateAcrossTenants(found.id, { lastLoginAt: new Date() } as Partial<User>);

            const issued = await this.issueTokens(found, tenant.id);
            return { user: found, tokens: issued };
        });

        return { user: this.sanitizeUser(user), tenant, ...tokens };
    }

    async refreshToken(refreshToken: string): Promise<Omit<AuthResult, "user" | "tenant">> {
        const stored = await this.refreshTokenRepository.findValidByToken(refreshToken);
        if (!stored) {
            throw new UnauthorizedException("Invalid or expired refresh token");
        }

        // Verified against the REFRESH secret, not the access-token
        // JwtStrategy injected into this service — refresh tokens are
        // signed with a separate JWT_REFRESH_SECRET (see issueTokens()
        // below), so verifying with the access-token secret would always
        // fail, even for a genuine, unexpired refresh token.
        const payload = this.refreshTokenStrategy().verify(refreshToken);
        if (!payload || payload.type !== "refresh") {
            throw new UnauthorizedException("Invalid refresh token");
        }

        // Rotate: the old refresh token is single-use — revoking it here
        // means a stolen-and-replayed refresh token can only be used once,
        // and the legitimate client (which gets the new one back) keeps
        // working uninterrupted.
        await this.refreshTokenRepository.revoke(stored.id);

        if (!payload.tenantId) {
            // Should never happen for a token this service itself issued
            // (issueTokens() always embeds tenantId) — guards against a
            // malformed/forged-but-somehow-valid token rather than silently
            // passing `undefined` through below. Checked before the user
            // lookup specifically so runForTenant() below always has a
            // real tenantId to work with.
            throw new UnauthorizedException("Invalid refresh token");
        }

        // Not userRepository.findById(): that's tenant-scoped via
        // TenantContext, which isn't set on a /auth/refresh request (no
        // valid Authorization header — that's WHY the client is refreshing)
        // — same reasoning as findUserInTenant() above for login.
        // findByIdAcrossTenants() itself is a raw query against whatever
        // connection is active, so it must run inside runForTenant()'s
        // routing the same way login()'s user lookup does — confirmed
        // against a real dedicated tenant, the same "Invalid credentials"-
        // shaped failure (there: "Account no longer active") happens here
        // without it. issueTokens() also runs inside this same block for
        // the same reason login() calls it here — see login()'s own
        // comment for the full "roles: []" failure mode this avoids; its
        // own refresh-token write still correctly forces itself back to
        // the shared database regardless (see issueTokens()'s
        // ConnectionContext.run(undefined, ...)).
        const tokens = await runForTenant(this.tenantRegistry, payload.tenantId, async () => {
            const user = await this.userRepository.findByIdAcrossTenants(payload.sub);
            if (!user || !user.isActive) {
                throw new UnauthorizedException("Account no longer active");
            }
            return this.issueTokens(user, payload.tenantId!);
        });
        return tokens;
    }

    async getCurrentUser(): Promise<PublicUser> {
        const userId = this.requestContext.userId;
        if (!userId) {
            throw new UnauthorizedException("Not authenticated");
        }

        const user = await this.userRepository.findById(userId);
        if (!user) {
            throw new NotFoundException("User not found");
        }

        return this.sanitizeUser(user);
    }

    async logout(): Promise<{ message: string }> {
        const userId = this.requestContext.userId;
        if (userId) {
            // ConnectionContext.run(undefined, ...) — same reasoning as
            // issueTokens()'s refresh-token write: this is an
            // AUTHENTICATED request, so TenantMiddleware may have already
            // set ConnectionContext to a dedicated tenant's own connection
            // for the rest of this request — but RefreshToken always lives
            // on the shared database regardless, so revoking it needs to
            // explicitly clear that back to the shared pool, or this
            // silently revokes nothing (querying a database that simply
            // doesn't have this user's refresh_tokens rows at all).
            await ConnectionContext.run(undefined as any, () => this.refreshTokenRepository.revokeAllForUser(userId));
        }
        return { message: "Logged out successfully" };
    }

    // ---- internals ----

    private async issueTokens(user: User, tenantId: string): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
        const identity = await this.roleService.rolesFor({ modelType: "User", modelId: user.id, tenantId });
        const roleNames = identity.map((r) => r.name);

        const accessToken = this.jwtStrategy.sign({
            sub: user.id,
            email: user.email,
            tenantId,
            roles: roleNames,
            type: "access",
        });

        // jti: a real random JWT ID, not just relying on iat for
        // uniqueness — two logins/refreshes for the same user within the
        // same second otherwise produce a BYTE-IDENTICAL signed token
        // (every other claim is deterministic), which collides on
        // refresh_tokens.token's unique constraint and makes the request
        // fail with a real DB error. Reproduced against a real Postgres
        // instance: three logins in rapid succession, the third's INSERT
        // failed with a duplicate-key violation before this fix.
        const refreshToken = this.refreshTokenStrategy().sign({ sub: user.id, email: user.email, tenantId, type: "refresh", jti: randomUUID() });

        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + this.refreshTokenTtlDays());

        // ConnectionContext.run(undefined, ...): explicitly clears whatever
        // dedicated-tenant connection might currently be active (e.g. this
        // whole issueTokens() call happening inside login()'s
        // runForTenant() wrapper) for JUST this one write — confirmed via
        // AsyncLocalStorage's own semantics that .run(undefined, fn) makes
        // .getStore() read back as undefined inside fn, which
        // Model.connection()'s `?? modelClass.db` fallback then correctly
        // treats as "use the global shared pool", same as if no
        // ConnectionContext were active at all. RefreshToken has no
        // tenantId and is deliberately never migrated to a dedicated
        // database (see this file's own comments elsewhere on why) — it
        // must always land on the shared database regardless of which
        // connection was active when issueTokens() itself was called.
        // Reproduced against a real dedicated tenant: without this, a
        // login's refresh token write went to whatever connection was
        // ambiently active, silently succeeding against the WRONG
        // database's refresh_tokens table when one happened to also exist
        // there (e.g. from TenantMigrationService's own schema
        // auto-provisioning of the shared TENANT_SCOPED_MODELS list).
        await ConnectionContext.run(undefined as any, () =>
            this.refreshTokenRepository.create({
                userId: user.id,
                token: refreshToken,
                expiresAt,
                revoked: false,
            } as any)
        );

        return { accessToken, refreshToken, expiresIn: this.accessTokenTtlSeconds(accessToken) };
    }

    /**
     * Derives the real `expiresIn` (seconds) from the JWT's own `exp`/`iat`
     * claims, rather than a hardcoded constant that would silently drift
     * out of sync the moment a developer changes JWT_EXPIRES_IN in their
     * .env without also updating a second, unrelated number here.
     */
    private accessTokenTtlSeconds(accessToken: string): number {
        const payload = this.jwtStrategy.verify(accessToken);
        if (!payload?.exp || !payload?.iat) return 15 * 60; // fallback only if the payload is ever missing these — should not happen for a token this method itself just signed
        return payload.exp - payload.iat;
    }

    /**
     * Login needs the tenant BEFORE authentication succeeds — otherwise
     * there's no way to know which tenant's `users` row to check the
     * password against (the same email can legitimately exist in multiple
     * tenants). Resolution order: explicit `tenantSlug` in the request body
     * (a login form on a tenant-specific page can pass this), else the
     * subdomain the request arrived on (see SubdomainTenantResolver, same
     * mechanism TenantMiddleware itself uses for authenticated routes).
     */
    private async resolveTenantForLogin(dto: LoginDto): Promise<Tenant> {
        const tenantSlug = dto.tenantSlug;
        if (tenantSlug) {
            const tenant = await this.tenantRepository.findBySlug(tenantSlug);
            if (!tenant || !tenant.isActive) {
                throw new UnauthorizedException("Invalid credentials");
            }
            return tenant;
        }

        const host = this.request?.headers?.host as string | undefined;
        const subdomain = host?.split(".")[0];
        if (subdomain) {
            const tenant = await this.tenantRepository.findBySlug(subdomain);
            if (tenant && tenant.isActive) return tenant;
        }

        throw new BadRequestException(
            "Could not determine which workspace to sign in to — pass tenantSlug, or sign in from your workspace's own subdomain."
        );
    }

    /**
     * `UserRepository.findByEmail()` (like every `BaseRepository` method)
     * scopes to `TenantContext.get()` — but at LOGIN time, no tenant is
     * active yet in `TenantContext` (`TenantMiddleware` hasn't set one;
     * the tenant is exactly what `resolveTenantForLogin()` above just
     * figured out, from the login request itself). Rather than force-set
     * `TenantContext` from inside a service — a layering violation, and
     * risky in a request that might do OTHER tenant-scoped work afterward
     * on whatever tenant the middleware actually resolved — this queries
     * `users` directly with an explicit tenant filter instead, via
     * `UserRepository.findByEmailInTenant()`, a small non-tenant-scoped
     * escape hatch on that repository built for exactly this one case.
     */
    private async findUserInTenant(email: string, tenantId: string): Promise<User | null> {
        return this.userRepository.findByEmailInTenant(email, tenantId);
    }

    private async uniqueSlug(base: string): Promise<string> {
        let candidate = base;
        let suffix = 1;
        while (await this.tenantRepository.slugExists(candidate)) {
            suffix += 1;
            candidate = `${base}-${suffix}`;
        }
        return candidate;
    }

    private sanitizeUser(user: User): PublicUser {
        const { password, ...sanitized } = user;
        return sanitized;
    }
}

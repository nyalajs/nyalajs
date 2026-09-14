import { randomBytes } from "node:crypto";
import { Injectable, Inject } from "@nyalajs/core";
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from "@nyalajs/http";
import { TenantContext } from "@nyalajs/core";
import { ConfigService } from "@nyalajs/config";
import { Logger } from "@nyalajs/observability";
import { MailService } from "@nyalajs/mail";
import { RequestContext } from "@nyalajs/http";
import { RoleService } from "@nyalajs/permissions";
import { TenantRegistry } from "@nyalajs/tenancy";
import { TeamInviteRepository } from "../repositories/team-invite.repository";
import { UserRepository } from "../repositories/user.repository";
import { TenantRepository } from "../repositories/tenant.repository";
import { TeamInviteMail } from "../mail/team-invite.mail";
import { hashPassword } from "../helpers/password.helper";
import { runForTenant } from "../../database/run-for-tenant";
import type { TeamInvite } from "../models/team-invite.model";
import type { User, PublicUser } from "../models/user.model";

const INVITE_TTL_DAYS = 7;

export interface InviteMemberDto {
    email: string;
    role?: string;
}

export interface AcceptInviteDto {
    token: string;
    name: string;
    password: string;
}

@Injectable()
export class TeamService {
    constructor(
        private readonly config: ConfigService,
        private readonly logger: Logger,
        private readonly mailService: MailService,
        private readonly inviteRepository: TeamInviteRepository,
        private readonly userRepository: UserRepository,
        private readonly tenantRepository: TenantRepository,
        private readonly roleService: RoleService,
        private readonly tenantRegistry: TenantRegistry,
        @Inject("REQUEST_CONTEXT") private readonly requestContext: RequestContext
    ) {}

    /** Invites someone to join the current tenant (TenantContext-scoped — the current request's authenticated tenant). Requires an active tenant and user; enforced by the controller's guards, not re-checked here. */
    async inviteMember(dto: InviteMemberDto): Promise<TeamInvite> {
        const tenantId = TenantContext.get();
        const inviterId = this.requestContext.userId;
        if (!tenantId || !inviterId) {
            throw new BadRequestException("An active tenant and authenticated user are required to send an invite.");
        }

        const existingUser = await this.userRepository.findByEmailInTenant(dto.email.toLowerCase(), tenantId);
        if (existingUser) {
            throw new ConflictException("This person is already a member of your team.");
        }

        const token = randomBytes(32).toString("hex");
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + INVITE_TTL_DAYS);

        const invite = await this.inviteRepository.create({
            invitedByUserId: inviterId,
            email: dto.email.toLowerCase(),
            role: dto.role ?? "member",
            token,
            status: "pending",
            expiresAt,
        } as any);

        const tenant = await this.tenantRepository.findById(tenantId);
        const inviter = await this.userRepository.findById(inviterId);
        const acceptUrl = `${this.config.get("app.url")}/team/accept-invite?token=${token}`;

        // Not awaited — same reasoning as AuthService.register()'s
        // verification email: this is a real network call to an external
        // SMTP server, and inviteMember()'s HTTP response shouldn't block
        // on (or be at the mercy of the latency of) a non-critical side
        // effect. The invite row above already exists in the DB regardless
        // of whether the email itself ever arrives.
        void this.mailService
            .send(new TeamInviteMail(dto.email, tenant?.name ?? "your team", inviter?.name ?? "A team member", acceptUrl))
            .catch((err) => {
                this.logger.error("Failed to send team invite email", err instanceof Error ? err : new Error(String(err)), { inviteId: invite.id });
            });

        return invite;
    }

    /** Every pending invite for the current tenant. */
    async listPendingInvites(): Promise<TeamInvite[]> {
        return this.inviteRepository.findPendingForCurrentTenant();
    }

    /** Revokes a pending invite before it's accepted (TenantContext-scoped — can only revoke your own tenant's invites). */
    async revokeInvite(inviteId: string): Promise<void> {
        const invite = await this.inviteRepository.findById(inviteId);
        if (!invite) {
            throw new NotFoundException("Invite not found");
        }
        await this.inviteRepository.markDeclined(invite.id);
    }

    /**
     * Accepts an invite by token — creates the new user account in the
     * inviting tenant. No auth required to CALL this (the invited person
     * has no account yet); the token itself is the authorization.
     *
     * Once the invite is found, EVERY write below (the new user, the RBAC
     * role assignment, marking the invite accepted) must land on that
     * SAME database the invite itself lives on — which might be the
     * tenant's own dedicated database, not the shared one, if this tenant
     * has already been migrated (see TenantsService.migrateToDedicated()).
     * There's no TenantMiddleware routing this request the normal way
     * (accept-invite is unauthenticated — no JWT/subdomain to resolve a
     * tenant from), so this method does the same ConnectionContext.run()
     * routing TenantMiddleware would, manually, once it knows which tenant
     * this invite belongs to. Confirmed against a real dedicated tenant:
     * without this, a successfully-found invite still failed to create the
     * new user, because the write silently went to the WRONG database.
     */
    async acceptInvite(dto: AcceptInviteDto): Promise<{ userId: string; tenantId: string }> {
        const invite = await this.inviteRepository.findValidByToken(dto.token);
        if (!invite) {
            throw new BadRequestException("This invitation is invalid or has expired.");
        }

        return runForTenant(this.tenantRegistry, invite.tenantId, () => this.completeInviteAcceptance(invite, dto));
    }

    /** The actual account-creation/role-assignment/invite-cutover for acceptInvite() — split out so it can run either against the shared connection (the default) or wrapped in ConnectionContext.run() for a dedicated tenant, without duplicating this logic in both branches. */
    private async completeInviteAcceptance(invite: TeamInvite, dto: AcceptInviteDto): Promise<{ userId: string; tenantId: string }> {
        const existingUser = await this.userRepository.findByEmailInTenant(invite.email, invite.tenantId);
        if (existingUser) {
            throw new ConflictException("An account with this email already exists in this team.");
        }

        const passwordHash = await hashPassword(dto.password);
        // Not userRepository.create(): that's tenant-scoped via
        // TenantContext, which isn't set here — accept-invite is
        // deliberately unauthenticated (see acceptInvite()'s own doc
        // comment), so there's no JWT for TenantMiddleware to derive a
        // tenant from. Verified against a real request: using create()
        // here throws "Tenant context required" and the invite can never
        // be accepted.
        const user = await this.userRepository.createAcrossTenants({
            tenantId: invite.tenantId,
            name: dto.name,
            email: invite.email,
            password: passwordHash,
            role: invite.role,
            isActive: true,
        } as any);

        const role = await this.roleService.findOrCreate(invite.role, { tenantId: invite.tenantId });
        await this.roleService.assignRole({ modelType: "User", modelId: user.id, tenantId: invite.tenantId }, role);

        await this.inviteRepository.markAccepted(invite.id);

        return { userId: user.id, tenantId: invite.tenantId };
    }

    /** Removes an existing team member (not an invite) from the current tenant. Cannot remove yourself, and cannot remove the last remaining member. */
    async removeMember(userId: string): Promise<void> {
        const requesterId = this.requestContext.userId;
        if (userId === requesterId) {
            throw new ForbiddenException("You cannot remove yourself from the team. Transfer ownership first, or delete the workspace.");
        }

        const target = await this.userRepository.findById(userId);
        if (!target) {
            throw new NotFoundException("Team member not found");
        }

        const remaining = await this.userRepository.findActive();
        if (remaining.length <= 1) {
            throw new BadRequestException("Cannot remove the last remaining member of a team.");
        }

        await this.userRepository.deactivate(userId);
    }

    /** Every active member of the current tenant. */
    async listMembers(): Promise<PublicUser[]> {
        const members = await this.userRepository.findActive();
        return members.map(({ password, ...rest }) => rest);
    }
}

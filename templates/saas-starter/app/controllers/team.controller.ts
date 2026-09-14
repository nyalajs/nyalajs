import { Controller, Get, Post, Delete, Body, Param, UseGuards } from "@nyalajs/core";
import { ValidateBody } from "@nyalajs/validation";
import { AuthGuard, Roles } from "@nyalajs/security";
import { DBRolesGuard } from "@nyalajs/permissions";
import { TeamService } from "../services/team.service";
import { InviteMemberValidator, AcceptInviteValidator } from "../validators/team.validator";

interface InviteMemberDto {
    email: string;
    role?: string;
}

interface AcceptInviteDto {
    token: string;
    name: string;
    password: string;
}

/**
 * Team management: inviting/removing members of the CURRENT tenant.
 * `/team/accept-invite` is deliberately unauthenticated — the invited
 * person has no account (and therefore no token) yet; the invite token
 * itself is the proof of authorization.
 */
@Controller("/team")
export class TeamController {
    constructor(private readonly teamService: TeamService) {}

    @Get("/members")
    @UseGuards(AuthGuard)
    async listMembers() {
        return this.teamService.listMembers();
    }

    @Get("/invites")
    @UseGuards(AuthGuard, DBRolesGuard)
    @Roles("owner", "admin")
    async listInvites() {
        return this.teamService.listPendingInvites();
    }

    @Post("/invites")
    @UseGuards(AuthGuard, DBRolesGuard)
    @Roles("owner", "admin")
    @ValidateBody(InviteMemberValidator)
    async inviteMember(@Body() dto: InviteMemberDto) {
        return this.teamService.inviteMember(dto);
    }

    @Delete("/invites/:id")
    @UseGuards(AuthGuard, DBRolesGuard)
    @Roles("owner", "admin")
    async revokeInvite(@Param("id") id: string) {
        await this.teamService.revokeInvite(id);
        return { message: "Invite revoked" };
    }

    @Post("/accept-invite")
    @ValidateBody(AcceptInviteValidator)
    async acceptInvite(@Body() dto: AcceptInviteDto) {
        return this.teamService.acceptInvite(dto);
    }

    @Delete("/members/:id")
    @UseGuards(AuthGuard, DBRolesGuard)
    @Roles("owner", "admin")
    async removeMember(@Param("id") id: string) {
        await this.teamService.removeMember(id);
        return { message: "Member removed" };
    }
}

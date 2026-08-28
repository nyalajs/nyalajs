import { Controller, Get, Post, Body, UseGuards } from "@nyalajs/core";
import { AuthGuard, Roles } from "@nyalajs/security";
import { DBRolesGuard } from "@nyalajs/permissions";
import { BillingService, PLANS } from "../services/billing.service";

interface UpgradeDto {
    plan: string;
}

/**
 * Self-service billing for the CURRENT tenant. The actual subscription
 * status is never written here — only read/initiated. It's written by the
 * real gateway webhook instead — see BillingController's own
 * webhook route wiring in bootstrap/main.ts (mountWebhookRoute() takes the
 * raw Fastify instance directly, not a controller, so it can't live here
 * as a normal @Post() route — it needs the gateway's raw, unparsed request
 * body for signature verification, which this framework's normal JSON body
 * parsing would otherwise destroy).
 */
@Controller("/billing")
@UseGuards(AuthGuard)
export class BillingController {
    constructor(private readonly billingService: BillingService) {}

    @Get("/plans")
    async listPlans() {
        return PLANS;
    }

    @Get("/subscription")
    async getSubscription() {
        return this.billingService.getCurrentSubscription();
    }

    // @UseGuards() at method level REPLACES the class-level list entirely
    // (see MetadataScanner.getGuards()'s own doc comment — "method
    // overrides class", not merge) — AuthGuard must be repeated here, or
    // DBRolesGuard runs with no authenticated identity at all and every
    // request 401s with "Authentication required" regardless of a valid
    // token. Reproduced against a real request before this fix.
    @Post("/upgrade")
    @UseGuards(AuthGuard, DBRolesGuard)
    @Roles("owner", "admin")
    async upgrade(@Body() dto: UpgradeDto) {
        return this.billingService.createUpgradeCheckout(dto.plan);
    }
}

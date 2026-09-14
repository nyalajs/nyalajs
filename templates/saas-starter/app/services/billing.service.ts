import { Injectable } from "@nyalajs/core";
import { TenantContext } from "@nyalajs/core";
import { BadRequestException, NotFoundException } from "@nyalajs/http";
import { ConfigService } from "@nyalajs/config";
import { Logger } from "@nyalajs/observability";
import { PaymentService, PaymentEvent } from "@nyalajs/payments";
import { SubscriptionRepository } from "../repositories/subscription.repository";
import { TenantRepository } from "../repositories/tenant.repository";
import { UserRepository } from "../repositories/user.repository";
import type { Subscription } from "../models/subscription.model";

/**
 * Every paid plan this starter ships as an example — real apps replace
 * this with their own actual pricing. Amounts are in minor units (cents),
 * matching @nyalajs/payments' own convention across every gateway.
 */
export const PLANS: Record<string, { name: string; amountMinor: number; currency: "USD" }> = {
    starter: { name: "Starter", amountMinor: 1900, currency: "USD" },
    pro: { name: "Pro", amountMinor: 4900, currency: "USD" },
};

@Injectable()
export class BillingService {
    constructor(
        private readonly config: ConfigService,
        private readonly logger: Logger,
        private readonly paymentService: PaymentService,
        private readonly subscriptionRepository: SubscriptionRepository,
        private readonly tenantRepository: TenantRepository,
        private readonly userRepository: UserRepository
    ) {}

    async getCurrentSubscription(): Promise<Subscription> {
        const tenantId = TenantContext.get();
        if (!tenantId) {
            throw new BadRequestException("No active tenant for this request.");
        }

        const existing = await this.subscriptionRepository.findByTenantId(tenantId);
        if (existing) return existing;

        // Every tenant implicitly starts on the free plan even before any
        // subscription row exists — create it lazily on first read rather
        // than requiring AuthService.register() to also know about billing.
        return this.subscriptionRepository.upsertForTenant(tenantId, { plan: "free", status: "active" });
    }

    /** Starts a real checkout for upgrading to a paid plan — returns the URL to redirect the customer to. */
    async createUpgradeCheckout(planKey: string): Promise<{ checkoutUrl: string }> {
        const plan = PLANS[planKey];
        if (!plan) {
            throw new BadRequestException(`Unknown plan "${planKey}". Available plans: ${Object.keys(PLANS).join(", ")}`);
        }

        const tenantId = TenantContext.get();
        if (!tenantId) {
            throw new BadRequestException("No active tenant for this request.");
        }

        const tenant = await this.tenantRepository.findById(tenantId);
        if (!tenant) {
            throw new NotFoundException("Tenant not found");
        }

        const owner = (await this.userRepository.findByRole("owner"))[0];
        const appUrl = this.config.get<string>("app.url");

        const session = await this.paymentService.createCheckout({
            // tenantId + plan encoded into the reference so the webhook
            // handler can identify which tenant/plan a payment was for
            // without a second lookup — every gateway round-trips this
            // value back unchanged on the resulting event.
            reference: `sub_${tenantId}_${planKey}_${Date.now()}`,
            currency: plan.currency,
            amountMinor: plan.amountMinor,
            customerEmail: owner?.email,
            successUrl: `${appUrl}/billing/success`,
            cancelUrl: `${appUrl}/billing/cancelled`,
            metadata: { tenantId, plan: planKey },
        });

        return { checkoutUrl: session.checkoutUrl };
    }

    /**
     * Called by BillingController's webhook route for every verified
     * payment event — the ONLY place subscription status is ever written
     * from something other than an explicit tenant-scoped self-service
     * call (getCurrentSubscription()'s lazy free-plan creation above).
     */
    async handlePaymentEvent(event: PaymentEvent): Promise<void> {
        const tenantId = event.metadata?.tenantId;
        const plan = event.metadata?.plan;

        if (!tenantId) {
            this.logger.warn("Payment event with no tenantId in metadata — ignoring", { reference: event.reference, gateway: event.gateway });
            return;
        }

        if (event.type === "payment.succeeded") {
            const currentPeriodEndsAt = new Date();
            currentPeriodEndsAt.setMonth(currentPeriodEndsAt.getMonth() + 1);

            await this.subscriptionRepository.upsertForTenant(tenantId, {
                plan: plan ?? "starter",
                status: "active",
                gateway: event.gateway,
                gatewayReference: event.gatewayReference,
                currentPeriodEndsAt,
            });
            await this.tenantRepository.update(tenantId, { plan: plan ?? "starter" } as any);

            this.logger.info("Subscription activated", { tenantId, plan, gateway: event.gateway });
        } else if (event.type === "payment.failed") {
            await this.subscriptionRepository.upsertForTenant(tenantId, { status: "past_due" });
            this.logger.warn("Payment failed for subscription", { tenantId, gateway: event.gateway });
        } else if (event.type === "payment.refunded") {
            await this.subscriptionRepository.upsertForTenant(tenantId, { status: "cancelled", plan: "free" });
            await this.tenantRepository.update(tenantId, { plan: "free" } as any);
            this.logger.info("Subscription cancelled via refund", { tenantId, gateway: event.gateway });
        }
    }
}

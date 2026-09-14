import { Model, Table, Primary, StringColumn, TimestampColumn } from "@nyalajs/database";

/**
 * Subscriptions — tenant-scoped, one row per tenant (tenantId is UNIQUE at
 * the DB level, see the migration). Kept in sync with the real gateway via
 * BillingController's webhook handler (see @nyalajs/payments'
 * mountWebhookRoute()/PaymentEvent), never written to directly from a
 * self-service endpoint. `gateway`/`gatewayReference` let you look the real
 * subscription/customer back up on whichever payment gateway is configured.
 */
@Table("subscriptions")
export class Subscription extends Model {
    @Primary()
    @StringColumn(255)
    id!: string;

    @StringColumn(255, { dbName: "tenant_id" })
    tenantId!: string;

    @StringColumn(50)
    plan!: string;

    @StringColumn(20)
    status!: string;

    @StringColumn(50, { nullable: true })
    gateway?: string | null;

    @StringColumn(255, { dbName: "gateway_reference", nullable: true })
    gatewayReference?: string | null;

    @TimestampColumn({ dbName: "current_period_ends_at", nullable: true })
    currentPeriodEndsAt?: Date | null;

    @TimestampColumn({ dbName: "created_at" })
    createdAt!: Date;

    @TimestampColumn({ dbName: "updated_at" })
    updatedAt!: Date;
}

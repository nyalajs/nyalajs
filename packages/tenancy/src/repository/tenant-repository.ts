import { TenantContext } from "@nyalajs/core";
import { Model } from "@nyalajs/database";

/**
 * Base class for tenant-scoped repositories, backed by an @nyalajs/database
 * Model. Every method here delegates to the Model's static methods, which
 * already enforce tenant scoping (via TenantContext + the table's tenant_id
 * column, fail-closed when no tenant is active) — so there is no
 * per-repository filtering logic for a subclass to forget or get wrong.
 *
 * @example
 * @Table("invoices")
 * class Invoice extends Model {
 *   @Primary() @StringColumn() id!: string;
 *   @Column({ name: "tenant_id" }) tenantId!: string;
 * }
 *
 * @Injectable()
 * class InvoiceRepository extends TenantRepository<Invoice> {
 *   protected readonly model = Invoice;
 * }
 */
export abstract class TenantRepository<T extends Model> {
    protected abstract readonly model: (new () => T) & typeof Model;

    protected ensureTenant(): void {
        if (!TenantContext.get()) {
            throw new Error(
                "Tenant context required for this operation. This is a security measure to prevent data leakage."
            );
        }
    }

    protected getTenantId(): string {
        this.ensureTenant();
        return TenantContext.get()!;
    }

    async find(): Promise<T[]> {
        return (this.model as any).all();
    }

    async findOne(id: string | number): Promise<T | null> {
        return (this.model as any).find(id);
    }

    async create(data: Partial<T>): Promise<T> {
        return (this.model as any).create(data);
    }

    async update(id: string | number, data: Partial<T>): Promise<T> {
        const existing = await this.findOne(id);
        if (!existing) {
            throw new Error(`${this.model.name} record not found: ${id}`);
        }
        Object.assign(existing, data);
        return (existing as any).save();
    }

    async delete(id: string | number): Promise<void> {
        const existing = await this.findOne(id);
        if (existing) {
            await (existing as any).delete();
        }
    }
}

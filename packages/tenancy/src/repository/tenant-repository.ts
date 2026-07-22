import { Inject } from "@nyala/core";

export abstract class TenantRepository<T> {
    constructor(
        @Inject("REQUEST_CONTEXT") protected readonly ctx: any
    ) { }

    protected ensureTenant(): void {
        if (!this.ctx.tenantId) {
            throw new Error(
                "Tenant context required for this operation. This is a security measure to prevent data leakage."
            );
        }
    }

    protected getTenantId(): string {
        this.ensureTenant();
        return this.ctx.tenantId!;
    }

    // Subclasses implement these with automatic tenant filtering
    abstract find(criteria: any): Promise<T[]>;
    abstract findOne(id: string): Promise<T | null>;
    abstract create(data: Partial<T>): Promise<T>;
    abstract update(id: string, data: Partial<T>): Promise<T>;
    abstract delete(id: string): Promise<void>;
}

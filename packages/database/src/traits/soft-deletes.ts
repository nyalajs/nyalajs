import { Column } from "../schema/decorators";

/**
 * Mixin to add soft delete functionality to a Model.
 * In a fully typed implementation, this would dynamically add the `deleted_at` 
 * column to the SchemaRegistry and automatically append `isNull(table.deletedAt)` 
 * to all queries.
 */
export function SoftDeletes<T extends new (...args: any[]) => any>(Base: T) {
    class SoftDeletable extends Base {
        @Column({ type: "timestamp", isNullable: true })
        deletedAt?: Date | null;

        async delete(): Promise<void> {
            this.deletedAt = new Date();
            await (this as any).save();
        }

        async forceDelete(): Promise<void> {
            await super.delete();
        }

        /**
         * Restore a soft-deleted record.
         */
        async restore(): Promise<void> {
            this.deletedAt = null;
            await (this as any).save();
        }
    }
    return SoftDeletable;
}

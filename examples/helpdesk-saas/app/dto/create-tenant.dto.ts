/**
 * Create Tenant DTO
 */
export class CreateTenantDto {
    name!: string;
    slug!: string;
    domain?: string;
    plan?: string;
}

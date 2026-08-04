/**
 * Create Ticket DTO
 *
 * Data Transfer Object for creating a new support ticket in a multi-tenant context.
 */
export class CreateTicketDto {
    subject!: string;
    description!: string;
    priority?: string;
}

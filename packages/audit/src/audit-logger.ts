import { Injectable } from "@nyala/core";
import { AuditEvent } from "./audit-event";
import { randomUUID } from "crypto";

export interface AuditStorage {
    save(event: AuditEvent): Promise<void>;
    query(criteria: any): Promise<AuditEvent[]>;
}

@Injectable()
export class AuditLogger {
    constructor(private readonly storage?: AuditStorage) { }

    async log(event: Omit<AuditEvent, "id" | "timestamp">): Promise<void> {
        const auditEvent: AuditEvent = {
            ...event,
            id: randomUUID(),
            timestamp: new Date(),
        };

        // Log to console (structured)
        console.log(
            JSON.stringify({
                level: "audit",
                ...auditEvent,
            })
        );

        // Persist to storage if available
        if (this.storage) {
            await this.storage.save(auditEvent);
        }
    }

    async query(criteria: any): Promise<AuditEvent[]> {
        if (!this.storage) {
            throw new Error("Audit storage not configured");
        }

        return await this.storage.query(criteria);
    }
}

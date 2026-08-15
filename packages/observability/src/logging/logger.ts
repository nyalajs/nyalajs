import pino from "pino";
import { Injectable, Inject, LogContext } from "@nyalajs/core";

export interface LogEntry {
    level: "debug" | "info" | "warn" | "error";
    message: string;
    requestId?: string;
    traceId?: string;
    tenantId?: string;
    userId?: string;
    serviceName: string;
    timestamp: Date;
    metadata?: Record<string, any>;
}

@Injectable()
export class Logger {
    private logger: pino.Logger;

    constructor(
        @Inject("SERVICE_NAME") private readonly serviceName: string = "nyala-app"
    ) {
        const options: pino.LoggerOptions = {
            level: process.env.LOG_LEVEL ?? "info",
            formatters: {
                level: (label) => {
                    return { level: label };
                },
            },
            timestamp: pino.stdTimeFunctions.isoTime,
        };

        if (process.env.LOG_FILE) {
            // Use pino-roll for file rotation
            const transport = pino.transport({
                target: "pino-roll",
                options: {
                    file: process.env.LOG_FILE,
                    size: process.env.LOG_MAX_SIZE || "10m",
                    interval: process.env.LOG_INTERVAL || "1d",
                    mkdir: true,
                },
            });
            this.logger = pino(options, transport);
        } else {
            this.logger = pino(options);
        }
    }

    /**
     * requestId/traceId/tenantId/userId from the current request's
     * AsyncLocalStorage scope (see LogContext, set once per request by
     * FastifyAdapter and filled in further by TenantMiddleware/AuthGuard as
     * they learn more) — every log call picks these up automatically, with
     * no need to thread a child logger through call sites that don't have
     * direct access to the request. Explicit `metadata` fields win on
     * collision (e.g. a caller deliberately overriding requestId in a test).
     */
    private baseFields(metadata?: Record<string, any>): Record<string, any> {
        const ctx = LogContext.get();
        return {
            ...(ctx.requestId !== undefined && { requestId: ctx.requestId }),
            ...(ctx.traceId !== undefined && { traceId: ctx.traceId }),
            ...(ctx.tenantId !== undefined && { tenantId: ctx.tenantId }),
            ...(ctx.userId !== undefined && { userId: ctx.userId }),
            ...metadata,
            serviceName: this.serviceName,
        };
    }

    debug(message: string, metadata?: Record<string, any>): void {
        this.logger.debug(this.baseFields(metadata), message);
    }

    info(message: string, metadata?: Record<string, any>): void {
        this.logger.info(this.baseFields(metadata), message);
    }

    warn(message: string, metadata?: Record<string, any>): void {
        this.logger.warn(this.baseFields(metadata), message);
    }

    error(message: string, error?: Error, metadata?: Record<string, any>): void {
        this.logger.error(
            {
                ...this.baseFields(metadata),
                error: error
                    ? {
                        message: error.message,
                        stack: error.stack,
                        name: error.name,
                    }
                    : undefined,
            },
            message
        );
    }

    child(bindings: Record<string, any>): Logger {
        const childLogger = new Logger(this.serviceName);
        childLogger.logger = this.logger.child(bindings);
        return childLogger;
    }
}

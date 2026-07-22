import pino from "pino";
import { Injectable, Inject } from "@nyalajs/core";

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

    debug(message: string, metadata?: Record<string, any>): void {
        this.logger.debug({ ...metadata, serviceName: this.serviceName }, message);
    }

    info(message: string, metadata?: Record<string, any>): void {
        this.logger.info({ ...metadata, serviceName: this.serviceName }, message);
    }

    warn(message: string, metadata?: Record<string, any>): void {
        this.logger.warn({ ...metadata, serviceName: this.serviceName }, message);
    }

    error(message: string, error?: Error, metadata?: Record<string, any>): void {
        this.logger.error(
            {
                ...metadata,
                serviceName: this.serviceName,
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

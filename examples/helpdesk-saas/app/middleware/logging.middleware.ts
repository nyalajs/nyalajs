import { Injectable } from "@nyalajs/core";
import { Middleware, NextFunction } from "@nyalajs/http";
import { Logger } from "@nyalajs/observability";

@Injectable()
export class LoggingMiddleware implements Middleware {
    constructor(private logger: Logger) { }

    async use(req: any, res: any, next: NextFunction): Promise<void> {
        const startTime = Date.now();

        // Extract request metadata
        const { method, url } = req;
        const tenantId = req.tenantId;
        const userId = req.userId;

        // Log incoming request
        this.logger.info("Incoming request", {
            method,
            url,
            tenantId,
            userId,
        });

        try {
            await next();
            const duration = Date.now() - startTime;

            this.logger.info("Request completed", {
                method,
                url,
                duration,
            });
        } catch (error) {
            const duration = Date.now() - startTime;

            this.logger.error(
                "Request failed",
                error instanceof Error ? error : new Error(String(error)),
                {
                    method,
                    url,
                    duration,
                }
            );

            throw error;
        }
    }
}

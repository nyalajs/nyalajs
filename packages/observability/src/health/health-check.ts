import { Injectable } from "@nyalajs/core";

export interface HealthCheckResult {
    status: "up" | "down";
    details?: Record<string, any>;
}

export interface HealthIndicator {
    name: string;
    check(): Promise<HealthCheckResult>;
}

@Injectable()
export class HealthCheckService {
    private indicators: HealthIndicator[] = [];

    registerIndicator(indicator: HealthIndicator): void {
        this.indicators.push(indicator);
    }

    async checkLiveness(): Promise<{ status: "up" | "down" }> {
        // Liveness just checks if the process is running
        return { status: "up" };
    }

    async checkReadiness(): Promise<{
        status: "up" | "down";
        checks: Record<string, HealthCheckResult>;
    }> {
        const checks: Record<string, HealthCheckResult> = {};
        let overallStatus: "up" | "down" = "up";

        for (const indicator of this.indicators) {
            try {
                const result = await indicator.check();
                checks[indicator.name] = result;

                if (result.status === "down") {
                    overallStatus = "down";
                }
            } catch (error) {
                checks[indicator.name] = {
                    status: "down",
                    details: {
                        error: error instanceof Error ? error.message : "Unknown error",
                    },
                };
                overallStatus = "down";
            }
        }

        return {
            status: overallStatus,
            checks,
        };
    }
}

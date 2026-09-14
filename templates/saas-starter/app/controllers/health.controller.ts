import { Controller, Get, Injectable, Version, Inject } from "@nyalajs/core";
import { HealthCheckService, MetricsCollector } from "@nyalajs/observability";

@Injectable()
@Controller("/health")
@Version("1")
export class HealthController {
    constructor(
        private readonly healthCheck: HealthCheckService,
        private readonly metrics: MetricsCollector,
        @Inject("RESPONSE") private readonly response: any
    ) { }

    @Get("/live")
    async liveness() {
        return await this.healthCheck.checkLiveness();
    }

    /**
     * Deliberately sets a real 503 (not 200) when any indicator is down —
     * most orchestrators (Kubernetes readiness probes, ALB/NLB target group
     * health checks) key routing decisions off the HTTP status code, not
     * the JSON body. Returning 200 unconditionally here would mean an
     * instance that can't reach Postgres keeps receiving live traffic,
     * defeating the entire point of a readiness probe.
     */
    @Get("/ready")
    async readiness() {
        const result = await this.healthCheck.checkReadiness();
        if (result.status === "down") {
            this.response.status(503);
        }
        return result;
    }
}

@Injectable()
@Controller("/metrics")
export class MetricsController {
    constructor(private readonly metrics: MetricsCollector) { }

    @Get("/")
    async getMetrics() {
        return await this.metrics.getMetrics();
    }
}

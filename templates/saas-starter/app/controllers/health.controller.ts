import { Controller, Get, Injectable, Version } from "@nyala/core";
import { HealthCheckService, MetricsCollector } from "@nyala/observability";

@Injectable()
@Controller("/health")
@Version("1")
export class HealthController {
    constructor(
        private readonly healthCheck: HealthCheckService,
        private readonly metrics: MetricsCollector
    ) { }

    @Get("/live")
    async liveness() {
        return await this.healthCheck.checkLiveness();
    }

    @Get("/ready")
    async readiness() {
        return await this.healthCheck.checkReadiness();
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

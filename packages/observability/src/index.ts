import { Module } from "@nyala/core";
import { Logger } from "./logging/logger";
import { MetricsCollector } from "./metrics/metrics-collector";
import { HealthCheckService } from "./health/health-check";

export * from "./logging/logger";
export * from "./metrics/metrics-collector";
export * from "./health/health-check";

/**
 * ObservabilityModule — import into your AppModule to get Logger,
 * HealthCheckService, and MetricsCollector auto-registered in the DI
 * container with zero manual configuration.
 *
 * @example
 *   @Module({ imports: [ObservabilityModule] })
 *   export class AppModule {}
 */
@Module({
    imports: [],
    providers: [
        {
            provide: Logger,
            useFactory: () => new Logger(process.env.APP_NAME ?? "nyala-app"),
        },
        HealthCheckService,
        MetricsCollector,
    ],
    controllers: [],
    exports: [Logger, HealthCheckService, MetricsCollector],
})
export class ObservabilityModule {}

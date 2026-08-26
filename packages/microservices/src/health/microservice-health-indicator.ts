/**
 * Structurally matches @nyalajs/observability's HealthIndicator interface
 * ({ name, check(): Promise<{status, details?}> }) without taking a hard
 * dependency on that package — microservices stays usable in an app that
 * doesn't pull in observability at all. Register the result with
 * HealthCheckService.registerIndicator() if you do.
 */
export interface HealthCheckResult {
    status: "up" | "down";
    details?: Record<string, any>;
}

export interface HealthIndicator {
    name: string;
    check(): Promise<HealthCheckResult>;
}

interface HealthCheckable {
    isHealthy(): Promise<boolean>;
}

/**
 * Wraps a NyalaMicroserviceApplication, a ClientProxy, or anything else with
 * an `isHealthy()` method into a HealthIndicator, so a microservice
 * connection shows up in /health/ready alongside database/cache checks.
 *
 * @example
 *   const usersClient = app.get<ClientProxy>("USERS_SERVICE");
 *   healthCheckService.registerIndicator(
 *     microserviceHealthIndicator("users-service", usersClient)
 *   );
 */
export function microserviceHealthIndicator(name: string, target: HealthCheckable): HealthIndicator {
    return {
        name,
        async check(): Promise<HealthCheckResult> {
            try {
                const healthy = await target.isHealthy();
                return healthy ? { status: "up" } : { status: "down" };
            } catch (error) {
                return { status: "down", details: { error: (error as Error).message } };
            }
        },
    };
}

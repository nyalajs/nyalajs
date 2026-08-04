import { describe, it, expect } from "vitest";
import { HealthCheckService, HealthIndicator } from "../health/health-check";

function indicator(name: string, result: HealthIndicator["check"]): HealthIndicator {
    return { name, check: result };
}

describe("HealthCheckService", () => {
    it("checkLiveness() is always up", async () => {
        const service = new HealthCheckService();
        expect(await service.checkLiveness()).toEqual({ status: "up" });
    });

    it("checkReadiness() with no indicators registered is up", async () => {
        const service = new HealthCheckService();
        const result = await service.checkReadiness();
        expect(result).toEqual({ status: "up", checks: {} });
    });

    it("checkReadiness() aggregates multiple up indicators as up", async () => {
        const service = new HealthCheckService();
        service.registerIndicator(indicator("db", async () => ({ status: "up" })));
        service.registerIndicator(indicator("redis", async () => ({ status: "up" })));

        const result = await service.checkReadiness();
        expect(result.status).toBe("up");
        expect(result.checks.db.status).toBe("up");
        expect(result.checks.redis.status).toBe("up");
    });

    it("checkReadiness() is down overall if any indicator is down", async () => {
        const service = new HealthCheckService();
        service.registerIndicator(indicator("db", async () => ({ status: "up" })));
        service.registerIndicator(indicator("redis", async () => ({ status: "down", details: { reason: "timeout" } })));

        const result = await service.checkReadiness();
        expect(result.status).toBe("down");
        expect(result.checks.redis).toEqual({ status: "down", details: { reason: "timeout" } });
    });

    it("checkReadiness() treats a throwing indicator as down, with the error captured", async () => {
        const service = new HealthCheckService();
        service.registerIndicator(
            indicator("flaky", async () => {
                throw new Error("connection refused");
            })
        );

        const result = await service.checkReadiness();
        expect(result.status).toBe("down");
        expect(result.checks.flaky.status).toBe("down");
        expect(result.checks.flaky.details?.error).toBe("connection refused");
    });
});

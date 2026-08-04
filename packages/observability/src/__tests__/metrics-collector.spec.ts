import { describe, it, expect } from "vitest";
import { MetricsCollector } from "../metrics/metrics-collector";

describe("MetricsCollector", () => {
    it("increments the http_requests_total counter and reflects it in getMetrics()", async () => {
        const metrics = new MetricsCollector();
        metrics.incrementCounter("http_requests_total", { method: "GET", path: "/x", status: "200", tenant: "t1" });

        const output = await metrics.getMetrics();
        expect(output).toContain("http_requests_total");
        expect(output).toMatch(/http_requests_total\{.*method="GET".*\} 1/);
    });

    it("increments without labels", async () => {
        const metrics = new MetricsCollector();
        metrics.incrementCounter("http_errors_total");

        const output = await metrics.getMetrics();
        expect(output).toMatch(/http_errors_total(\{\})? 1/);
    });

    it("records a histogram observation", async () => {
        const metrics = new MetricsCollector();
        metrics.recordHistogram("http_request_duration_seconds", 0.05, { method: "GET", path: "/x", status: "200", tenant: "t1" });

        const output = await metrics.getMetrics();
        expect(output).toContain("http_request_duration_seconds");
    });

    it("sets and increments/decrements the active-requests gauge", async () => {
        const metrics = new MetricsCollector();
        metrics.incrementGauge("http_requests_active");
        metrics.incrementGauge("http_requests_active");
        metrics.decrementGauge("http_requests_active");

        const output = await metrics.getMetrics();
        expect(output).toMatch(/http_requests_active 1/);
    });

    it("ignores unknown metric names instead of throwing", () => {
        const metrics = new MetricsCollector();
        expect(() => metrics.incrementCounter("not_a_real_metric")).not.toThrow();
        expect(() => metrics.recordHistogram("not_a_real_metric", 1)).not.toThrow();
        expect(() => metrics.setGauge("not_a_real_metric", 1)).not.toThrow();
    });

    it("getMetrics() returns Prometheus exposition format", async () => {
        const metrics = new MetricsCollector();
        const output = await metrics.getMetrics();
        expect(output).toContain("# HELP");
        expect(output).toContain("# TYPE");
    });
});

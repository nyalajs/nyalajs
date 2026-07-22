import { Injectable } from "@nyalajs/core";
import { Registry, Counter, Histogram, Gauge } from "prom-client";

@Injectable()
export class MetricsCollector {
    private registry: Registry;
    private httpRequestsTotal: Counter;
    private httpRequestDuration: Histogram;
    private httpRequestsActive: Gauge;
    private httpErrorsTotal: Counter;

    constructor() {
        this.registry = new Registry();

        // HTTP request counter
        this.httpRequestsTotal = new Counter({
            name: "http_requests_total",
            help: "Total number of HTTP requests",
            labelNames: ["method", "path", "status", "tenant"],
            registers: [this.registry],
        });

        // HTTP request duration
        this.httpRequestDuration = new Histogram({
            name: "http_request_duration_seconds",
            help: "HTTP request duration in seconds",
            labelNames: ["method", "path", "status", "tenant"],
            buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 5],
            registers: [this.registry],
        });

        // Active HTTP requests
        this.httpRequestsActive = new Gauge({
            name: "http_requests_active",
            help: "Number of active HTTP requests",
            registers: [this.registry],
        });

        // HTTP errors counter
        this.httpErrorsTotal = new Counter({
            name: "http_errors_total",
            help: "Total number of HTTP errors",
            labelNames: ["method", "path", "status", "tenant"],
            registers: [this.registry],
        });
    }

    incrementCounter(
        name: string,
        labels?: Record<string, string>
    ): void {
        if (name === "http_requests_total") {
            if (labels) this.httpRequestsTotal.inc(labels); else this.httpRequestsTotal.inc();
        } else if (name === "http_errors_total") {
            if (labels) this.httpErrorsTotal.inc(labels); else this.httpErrorsTotal.inc();
        }
    }

    recordHistogram(
        name: string,
        value: number,
        labels?: Record<string, string>
    ): void {
        if (name === "http_request_duration_seconds") {
            this.httpRequestDuration.observe(labels ?? {}, value);
        }
    }

    setGauge(
        name: string,
        value: number,
        labels?: Record<string, string>
    ): void {
        if (name === "http_requests_active") {
            this.httpRequestsActive.set(labels ?? {}, value);
        }
    }

    incrementGauge(name: string, labels?: Record<string, string>): void {
        if (name === "http_requests_active") {
            if (labels) this.httpRequestsActive.inc(labels); else this.httpRequestsActive.inc();
        }
    }

    decrementGauge(name: string, labels?: Record<string, string>): void {
        if (name === "http_requests_active") {
            if (labels) this.httpRequestsActive.dec(labels); else this.httpRequestsActive.dec();
        }
    }

    async getMetrics(): Promise<string> {
        return await this.registry.metrics();
    }
}

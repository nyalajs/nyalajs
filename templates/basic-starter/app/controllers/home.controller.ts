import { Controller, Get } from "@nyalajs/core";

/**
 * Home Controller
 *
 * Handles basic application endpoints like home and health checks.
 */
@Controller("/")
export class HomeController {
    /**
     * GET /
     * Welcome endpoint
     */
    @Get("/")
    async index() {
        return {
            message: "Welcome to Nyala MVC Starter",
            version: "1.0.0",
            documentation: "/api/docs",
        };
    }

    /**
     * GET /health
     * Health check endpoint
     */
    @Get("/health")
    async health() {
        return {
            status: "ok",
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            memory: process.memoryUsage(),
        };
    }

    /**
     * GET /health/live
     * Liveness probe (for Kubernetes)
     */
    @Get("/health/live")
    async liveness() {
        return { status: "alive" };
    }

    /**
     * GET /health/ready
     * Readiness probe (for Kubernetes)
     */
    @Get("/health/ready")
    async readiness() {
        // Add database connection check here
        return { status: "ready" };
    }
}

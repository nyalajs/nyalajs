import { NyalaApplication } from "@nyala/core";
import { FastifyInstance, InjectOptions, LightMyRequestResponse } from "fastify";

/**
 * Utility for end-to-end testing HTTP routes without listening on a port.
 * Wraps Fastify's `.inject()` method.
 */
export class HttpTestClient {
    private fastify: FastifyInstance;

    constructor(app: NyalaApplication) {
        // We know the HTTP adapter is FastifyAdapter in this implementation
        const adapter = (app as any).httpAdapter;
        if (!adapter) {
            throw new Error("HTTP adapter not initialized. Call app.setHttpAdapter() first.");
        }
        this.fastify = adapter.getInstance();
    }

    /**
     * Send a mocked HTTP request into the application pipeline.
     */
    async inject(options: InjectOptions | string): Promise<LightMyRequestResponse> {
        return this.fastify.inject(options);
    }

    get(url: string, headers?: Record<string, string>) {
        return this.inject({ method: "GET", url, headers });
    }

    post(url: string, payload?: any, headers?: Record<string, string>) {
        return this.inject({ method: "POST", url, payload, headers });
    }

    put(url: string, payload?: any, headers?: Record<string, string>) {
        return this.inject({ method: "PUT", url, payload, headers });
    }

    delete(url: string, headers?: Record<string, string>) {
        return this.inject({ method: "DELETE", url, headers });
    }

    patch(url: string, payload?: any, headers?: Record<string, string>) {
        return this.inject({ method: "PATCH", url, payload, headers });
    }
}

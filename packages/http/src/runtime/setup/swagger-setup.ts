import { FastifyInstance } from "fastify";

export function setupSwagger(app: FastifyInstance): void {
    app.register(require("@fastify/swagger"), {
        openapi: {
            info: {
                title: "NyalaJS API",
                description: "Auto-generated API documentation",
                version: "1.0.0",
            },
            servers: [
                {
                    url: "http://localhost:3000",
                },
            ],
            components: {
                securitySchemes: {
                    bearerAuth: {
                        type: "http",
                        scheme: "bearer",
                        bearerFormat: "JWT",
                    },
                },
            },
        },
    });

    app.register(require("@fastify/swagger-ui"), {
        routePrefix: "/docs",
        uiConfig: {
            docExpansion: "list",
            deepLinking: false,
        },
    });
}

import { FastifyInstance } from "fastify";
import { FastifyAdapterOptions } from "../fastify-adapter";

export function setupSecurityDefaults(app: FastifyInstance, options: FastifyAdapterOptions): void {
    if (options.compress !== false) {
        // Enable gzip/deflate/brotli compression for all responses
        app.register(require("@fastify/compress"), {
            global: true,
            encodings: ["gzip", "deflate", "br"],
            threshold: 1024, // Only compress responses > 1KB
        });
    }

    // Register session support if requested (true by default unless explicitly disabled)
    if (options.session !== false) {
        const secret = process.env.SESSION_SECRET;
        const salt = process.env.SESSION_SALT;

        if (!secret || secret.length < 32) {
            throw new Error(
                "SESSION_SECRET is required (min 32 chars) when sessions are enabled. " +
                "Generate one with: openssl rand -base64 32\n" +
                "Set session: false in FastifyAdapterOptions to disable sessions instead."
            );
        }

        if (!salt || salt.length !== 16) {
            throw new Error(
                "SESSION_SALT is required and must be exactly 16 characters when sessions are enabled. " +
                "Generate one with: openssl rand -base64 12 | cut -c1-16\n" +
                "Set session: false in FastifyAdapterOptions to disable sessions instead."
            );
        }

        app.register(require("@fastify/secure-session"), {
            secret,
            salt,
            cookie: {
                path: "/",
                httpOnly: true,
                secure: process.env.NODE_ENV === "production",
                sameSite: "lax",
            }
        });
    }

    if (options.helmet !== false) {
        app.register(require("@fastify/helmet"), {
            contentSecurityPolicy: {
                directives: {
                    defaultSrc: ["'self'"],
                    styleSrc: ["'self'", "'unsafe-inline'"],
                    scriptSrc: ["'self'"],
                    imgSrc: ["'self'", "data:", "https:"],
                },
            },
            crossOriginEmbedderPolicy: false,
        });
    }

    if (options.cors !== false) {
        const corsOrigin = options.corsOrigin ?? false;
        app.register(require("@fastify/cors"), {
            origin: corsOrigin,
            credentials: corsOrigin !== false,
        });
    }

    if (options.rateLimit !== false) {
        const rateLimitConfig: Record<string, any> = {
            max: Number(process.env.RATE_LIMIT_MAX) || 100,
            timeWindow: Number(process.env.RATE_LIMIT_WINDOW_MS) || 60_000,
            ban: 2, // Ban after 2x max requests
        };

        // Use Redis as the store when REDIS_URL is configured
        const redisUrl = process.env.REDIS_URL || process.env.REDIS_HOST;
        if (redisUrl) {
            try {
                // eslint-disable-next-line @typescript-eslint/no-var-requires
                const Redis = require("ioredis");
                rateLimitConfig.redis = new Redis(
                    process.env.REDIS_URL
                        ? process.env.REDIS_URL
                        : {
                              host: process.env.REDIS_HOST || "localhost",
                              port: Number(process.env.REDIS_PORT) || 6379,
                              password: process.env.REDIS_PASSWORD,
                          }
                );
            } catch {
                // ioredis not installed — silently fall back to in-memory
            }
        }

        app.register(require("@fastify/rate-limit"), rateLimitConfig);
    }

    if (options.csrf !== false) {
        if (options.session !== false) {
            // @fastify/secure-session bundles its own @fastify/cookie
            // internally — registering the standalone plugin too (the
            // old unconditional path) throws FST_ERR_DEC_ALREADY_PRESENT
            // ("serializeCookie" decorated twice). Point CSRF at the
            // session plugin directly instead; it supports this natively.
            app.register(require("@fastify/csrf-protection"), {
                sessionPlugin: "@fastify/secure-session",
            });
        } else {
            app.register(require("@fastify/cookie"));
            app.register(require("@fastify/csrf-protection"));
        }
    }
}

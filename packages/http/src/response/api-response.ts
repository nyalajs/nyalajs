/**
 * Standard API response envelope — §4.7 Responses.
 *
 * All Nyala handlers can return a plain object (Fastify serialises it) or
 * wrap their data in one of these helpers for a consistent envelope shape.
 *
 * Shape:
 *   { success, data?, meta?, error?, requestId?, timestamp }
 */

export interface HttpApiResponse<T = unknown> {
    success: boolean;
    data?: T;
    meta?: Record<string, unknown>;
    error?: string;
    message?: string;
    requestId?: string;
    timestamp: string;
}

export interface PaginatedMeta {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    [key: string]: any;
}

export interface PaginatedResponse<T> extends HttpApiResponse<T[]> {
    meta: PaginatedMeta;
}

// ── Factory helpers ───────────────────────────────────────────────────────────

/** 200 OK */
export function ok<T>(data: T, message?: string, requestId?: string): HttpApiResponse<T> {
    return {
        success: true,
        data,
        message,
        requestId,
        timestamp: new Date().toISOString(),
    };
}

/** 201 Created */
export function created<T>(data: T, requestId?: string): HttpApiResponse<T> {
    return {
        success: true,
        data,
        requestId,
        timestamp: new Date().toISOString(),
    };
}

/** Paginated list */
export function paginated<T>(
    data: T[],
    meta: PaginatedMeta,
    requestId?: string
): PaginatedResponse<T> {
    return {
        success: true,
        data,
        meta,
        requestId,
        timestamp: new Date().toISOString(),
    };
}

/** Error response */
export function errorResponse(message: string, error?: string, requestId?: string): HttpApiResponse<never> {
    return {
        success: false,
        error: error ?? "Error",
        message,
        requestId,
        timestamp: new Date().toISOString(),
    };
}

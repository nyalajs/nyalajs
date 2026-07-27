import { ExecutionContext } from "../context/execution-context";
import { RenderableResponse, isRenderable } from "../response/renderable.interface";
import { defaultErrorPage } from "./default-error-page";

/**
 * Renders a branded HTML error page. Return a plain string, or a
 * RenderableResponse (e.g. @nyalajs/react's `view()`). Only invoked for
 * requests that prefer HTML (`Accept: text/html`, i.e. browser navigation)
 * — JSON API clients are unaffected either way.
 */
export type ErrorViewRenderer = (
    error: Error,
    statusCode: number,
    ctx: ExecutionContext
) => string | RenderableResponse | Promise<string | RenderableResponse>;

export class HttpException extends Error {
    constructor(
        public readonly statusCode: number,
        public readonly error: string,
        message: string
    ) {
        super(message);
        this.name = "HttpException";
    }
}

export class BadRequestException extends HttpException {
    constructor(message: string = "Bad Request") {
        super(400, "Bad Request", message);
    }
}

export class UnauthorizedException extends HttpException {
    constructor(message: string = "Unauthorized") {
        super(401, "Unauthorized", message);
    }
}

export class ForbiddenException extends HttpException {
    constructor(message: string = "Forbidden") {
        super(403, "Forbidden", message);
    }
}

export class NotFoundException extends HttpException {
    constructor(message: string = "Not Found") {
        super(404, "Not Found", message);
    }
}

export class ConflictException extends HttpException {
    constructor(message: string = "Conflict") {
        super(409, "Conflict", message);
    }
}

export class UnprocessableEntityException extends HttpException {
    constructor(message: string = "Unprocessable Entity", public readonly details?: any) {
        super(422, "Unprocessable Entity", message);
    }
}

export class TooManyRequestsException extends HttpException {
    constructor(message: string = "Too Many Requests") {
        super(429, "Too Many Requests", message);
    }
}

export class InternalServerErrorException extends HttpException {
    constructor(message: string = "Internal Server Error") {
        super(500, "Internal Server Error", message);
    }
}

export class ExceptionHandler {
    constructor(private readonly errorView?: ErrorViewRenderer) {}

    async handle(error: Error, ctx: ExecutionContext, reply: any): Promise<void> {
        const statusCode = this.getStatusCode(error);

        // Log error with context
        console.error(
            JSON.stringify({
                level: "error",
                message: error.message,
                error: error.name,
                stack: error.stack,
                requestId: ctx.context.requestId,
                traceId: ctx.context.traceId,
                tenantId: ctx.context.tenantId,
                userId: ctx.context.userId,
                method: ctx.request.method,
                path: ctx.request.url,
                statusCode,
                timestamp: new Date().toISOString(),
            })
        );

        // Content negotiation: a browser navigating to a page wants an HTML
        // error page, not a JSON blob. API clients (no text/html in Accept)
        // see no change in behavior at all.
        const acceptsHtml = String(ctx.request.headers?.accept ?? "").includes("text/html");

        if (acceptsHtml) {
            const showDetails = process.env.NODE_ENV === "development";
            const rendered = this.errorView
                ? await this.errorView(error, statusCode, ctx)
                : defaultErrorPage(statusCode, error.message, showDetails, error.stack);
            const body = isRenderable(rendered) ? await rendered.render() : rendered;
            reply.status(statusCode).type("text/html").send(body);
            return;
        }

        const errorResponse = this.buildErrorResponse(error, ctx, statusCode);
        reply.status(statusCode).send(errorResponse);
    }

    private getStatusCode(error: Error): number {
        if (error instanceof HttpException) {
            return error.statusCode;
        }

        // Map common error types
        if (error.name === "ValidationError") {
            return 422;
        }

        if (error.name === "UnauthorizedError") {
            return 401;
        }

        if (error.name === "ForbiddenError") {
            return 403;
        }

        if (error.name === "NotFoundError") {
            return 404;
        }

        return 500;
    }

    private buildErrorResponse(error: Error, ctx: ExecutionContext, statusCode: number): any {
        const response: any = {
            statusCode,
            error: error instanceof HttpException ? error.error : error.name,
            message: error.message,
            requestId: ctx.context.requestId,
            timestamp: new Date().toISOString(),
            path: ctx.request.url,
        };

        if (error instanceof UnprocessableEntityException && error.details) {
            response.details = error.details;
        }

        // Fail closed: only include stack traces when explicitly in
        // development, not "any env name that isn't exactly 'production'"
        // (a misconfigured/misspelled NODE_ENV, e.g. "staging" or unset,
        // used to leak stack traces).
        if (process.env.NODE_ENV === "development") {
            response.stack = error.stack;
        }

        return response;
    }
}

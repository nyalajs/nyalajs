import { ExecutionContext } from "../context/execution-context";

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
    async handle(error: Error, ctx: ExecutionContext, reply: any): Promise<void> {
        const statusCode = this.getStatusCode(error);
        const errorResponse = this.buildErrorResponse(error, ctx, statusCode);

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

        // Don't expose stack traces in production
        if (process.env.NODE_ENV !== "production") {
            response.stack = error.stack;
        }

        return response;
    }
}

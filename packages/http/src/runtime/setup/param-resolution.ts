import { FastifyRequest, FastifyReply } from "fastify";
import { getParamMetadata, ParamType } from "@nyalajs/core";
import { UnprocessableEntityException } from "../../errors/exception-handler";

/**
 * Resolve handler arguments by reading @Body/@Param/@Query/@Headers/@Req/@Res
 * metadata.  Falls back to (body, params, query) positionally if no metadata
 * is declared (backwards-compatible with existing handlers).
 */
export function resolveHandlerParams(route: any, request: FastifyRequest, reply: FastifyReply): any[] {
    // Param decorators (@Body/@Param/@Query/@Req/@Res/...) store their
    // metadata on the controller *class* (see param.ts's
    // createParamDecorator — `target.constructor`), same convention as
    // route/guard/interceptor metadata — not on `.prototype`, which is
    // a different object and would always come back empty.
    const paramMeta = getParamMetadata(route.controller, route.handlerName);

    if (!paramMeta || paramMeta.length === 0) {
        // Legacy fallback: positional body, params, query
        return [(request as any).body, (request as any).params, (request as any).query];
    }

    const sorted = [...paramMeta].sort((a, b) => a.index - b.index);
    const args: any[] = [];

    for (const meta of sorted) {
        switch (meta.type) {
            case ParamType.BODY:
                args[meta.index] = meta.data
                    ? (request as any).body?.[meta.data]
                    : (request as any).body;
                break;
            case ParamType.PARAM:
                args[meta.index] = meta.data
                    ? (request as any).params?.[meta.data]
                    : (request as any).params;
                break;
            case ParamType.QUERY:
                args[meta.index] = meta.data
                    ? (request as any).query?.[meta.data]
                    : (request as any).query;
                break;
            case ParamType.HEADERS:
                args[meta.index] = meta.data
                    ? request.headers[meta.data.toLowerCase()]
                    : request.headers;
                break;
            case ParamType.REQUEST:
                args[meta.index] = request;
                break;
            case ParamType.RESPONSE:
                args[meta.index] = reply;
                break;
            case ParamType.UPLOADED_FILE:
                if (meta.data && (request as any).body) {
                    const field = (request as any).body[meta.data];
                    // fastify-multipart with attachFieldsToBody sometimes makes it an array
                    args[meta.index] = Array.isArray(field) ? field[0] : field;
                } else {
                    args[meta.index] = undefined;
                }
                break;
            case ParamType.UPLOADED_FILES:
                if (meta.data && (request as any).body) {
                    const field = (request as any).body[meta.data];
                    args[meta.index] = Array.isArray(field) ? field : [field].filter(Boolean);
                } else {
                    // Return all file fields from body
                    const files = Object.values((request as any).body || {})
                        .flat()
                        .filter((part: any) => part && part.type === 'file');
                    args[meta.index] = files;
                }
                break;
            case ParamType.COOKIE:
                // Requires @fastify/cookie to be registered
                args[meta.index] = meta.data
                    ? (request as any).cookies?.[meta.data]
                    : (request as any).cookies ?? {};
                break;
            case ParamType.IP:
                args[meta.index] = request.ip;
                break;
            case ParamType.HOST:
                args[meta.index] = request.headers?.host ?? null;
                break;
            default:
                args[meta.index] = undefined;
        }
    }

    return args;
}

/**
 * Reads nyala:validation metadata and executes Zod schemas against the request.
 * Throws UnprocessableEntityException if validation fails.
 */
export function validateRequest(controllerPrototype: any, handlerName: string, request: FastifyRequest): void {
    const rules = Reflect.getMetadata("nyala:validation", controllerPrototype, handlerName) || [];

    // Auto-discover Zod schemas from parameter types (DTOs with static schema)
    const paramTypes = Reflect.getMetadata("design:paramtypes", controllerPrototype, handlerName) || [];
    // Param decorator metadata lives on the class, not the prototype — see the comment in resolveHandlerParams().
    const paramMeta = getParamMetadata(controllerPrototype.constructor, handlerName) || [];

    for (const meta of paramMeta) {
        const paramType = paramTypes[meta.index];
        if (paramType && paramType.schema && typeof paramType.schema.parse === "function") {
            // If it's a body param, auto-validate body
            if (meta.type === ParamType.BODY && !rules.find((r: any) => r.target === "body")) {
                rules.push({ target: "body", schema: paramType.schema });
            }
            // If it's a query param, auto-validate query
            else if (meta.type === ParamType.QUERY && !rules.find((r: any) => r.target === "query")) {
                rules.push({ target: "query", schema: paramType.schema });
            }
        }
    }

    if (!rules || rules.length === 0) return;

    for (const rule of rules) {
        let dataToValidate;
        switch (rule.target) {
            case "body":   dataToValidate = request.body; break;
            case "query":  dataToValidate = request.query; break;
            case "params": dataToValidate = request.params; break;
        }

        try {
            // Execute Zod schema (we use duck-typing to avoid a hard dependency on zod here)
            if (rule.schema && typeof rule.schema.parse === "function") {
                const parsed = rule.schema.parse(dataToValidate);

                // Reassign the stripped/transformed data back to the request
                switch (rule.target) {
                    case "body":   request.body = parsed; break;
                    case "query":  request.query = parsed; break;
                    case "params": request.params = parsed; break;
                }
            }
        } catch (error: any) {
            // If it's a ZodError, format it
            if (error.issues && Array.isArray(error.issues)) {
                const details = error.issues.map((err: any) => ({
                    path: err.path.join("."),
                    message: err.message,
                }));
                throw new UnprocessableEntityException("Validation failed", details);
            }
            throw error;
        }
    }
}

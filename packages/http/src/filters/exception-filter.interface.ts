import { ExecutionContext } from "../context/execution-context";

/**
 * A pluggable, type-scoped alternative to the single global ExceptionHandler.
 * A filter registered via @Catch(SomeError) only runs for errors that are
 * `instanceof SomeError` (or one of several types, if @Catch() lists more
 * than one) — anything else falls through to the next matching filter, or
 * to the framework's default ExceptionHandler if none match.
 *
 * `reply` is the raw Fastify reply — same object ExceptionHandler itself
 * writes to, so a filter has full control (status code, headers, body).
 */
export interface ExceptionFilter<E extends Error = Error> {
    catch(error: E, context: ExecutionContext, reply: any): Promise<void> | void;
}

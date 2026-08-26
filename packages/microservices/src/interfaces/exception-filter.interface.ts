import { MicroserviceExecutionContext } from "../context/microservice-execution-context";

/**
 * A pluggable, type-scoped error handler for message/event handlers,
 * registered with @Catch(SomeError) + @UseFilters() (both re-exported from
 * @nyalajs/core, same decorators HTTP uses). Only runs for errors that are
 * `instanceof SomeError`; anything else falls through to the next matching
 * filter, or to the default behavior (reply with an error frame for a
 * "message" pattern, log-and-drop for an "event" pattern) if none match.
 *
 * Unlike HTTP's ExceptionFilter, there's no `reply` object to write to —
 * return the value that should become the RPC reply (for "message" kind;
 * ignored for "event" kind), or throw again to let a subsequent filter (or
 * the default handling) take over.
 */
export interface MicroserviceExceptionFilter<E extends Error = Error> {
    catch(error: E, context: MicroserviceExecutionContext): Promise<any> | any;
}

import { TracePropagation } from "../context/trace-propagation";

export interface IncomingCall {
    payload: any;
    trace: TracePropagation;
}

export type MessageHandler = (call: IncomingCall) => Promise<any>;
export type EventHandler = (call: IncomingCall) => Promise<void>;

/**
 * Server-side transport contract. A transport receives incoming
 * request-response calls and events over the wire, dispatches them to the
 * handler registered for that pattern, and (for `send`) writes the result
 * back to the caller.
 */
export interface Transporter {
    /** Register the handler invoked for a `@MessagePattern(pattern)` match. */
    addMessageHandler(pattern: string, handler: MessageHandler): void;

    /** Register the handler invoked for an `@EventPattern(pattern)` match. */
    addEventHandler(pattern: string, handler: EventHandler): void;

    /** Start accepting connections/subscriptions. */
    listen(): Promise<void>;

    /**
     * Stop accepting new work and release the underlying connection.
     * Implementations should stop accepting new calls immediately but let
     * in-flight handler invocations finish before the returned promise
     * resolves (graceful drain) — see each transport for its specific
     * drain behavior and `drainTimeoutMs` handling.
     */
    close(): Promise<void>;

    /**
     * Best-effort connectivity check for health endpoints
     * (@nyalajs/observability's health module). Should not throw — return
     * false on any failure to determine the state.
     */
    isHealthy(): Promise<boolean>;
}

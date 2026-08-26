import { TracePropagation } from "../context/trace-propagation";

export type TransportKind = "tcp" | "redis" | "grpc" | "nats" | "kafka";

export interface MicroserviceContext {
    pattern: string;
    transport: TransportKind;
    trace: TracePropagation;
}

/**
 * Client-side handle for talking to a microservice. Obtained via
 * `ClientProxyFactory.create(...)` or injected with `@Client(...)`.
 */
export abstract class ClientProxy {
    /** Open the underlying connection. Called automatically on first use if not already connected. */
    abstract connect(): Promise<void>;

    /** Close the underlying connection. */
    abstract close(): Promise<void>;

    /**
     * Request-response call: sends `payload` under `pattern` and resolves
     * with the remote handler's return value. Rejects if the remote handler
     * throws, or after `timeoutMs` (default 10s) with no reply.
     */
    abstract send<TResult = any, TPayload = any>(
        pattern: string,
        payload: TPayload,
        timeoutMs?: number
    ): Promise<TResult>;

    /**
     * Fire-and-forget: emits `payload` under `pattern` with no reply
     * expected. Resolves once the event has been handed to the transport.
     */
    abstract emit<TPayload = any>(pattern: string, payload: TPayload): Promise<void>;

    /** Best-effort connectivity check. Should not throw — returns false on any failure. */
    abstract isHealthy(): Promise<boolean>;
}

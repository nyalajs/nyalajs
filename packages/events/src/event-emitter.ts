/**
 * Core event emitter.
 * Provides sync/async pub-sub within the same Node.js process.
 */
export type EventListener<T = any> = (payload: T) => void | Promise<void>;

export class EventEmitter {
    private listeners = new Map<string, EventListener[]>();

    /**
     * Subscribe to an event.
     */
    on<T = any>(event: string, handler: EventListener<T>): void {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, []);
        }
        this.listeners.get(event)!.push(handler);
    }

    /**
     * Unsubscribe from an event.
     */
    off<T = any>(event: string, handler: EventListener<T>): void {
        const eventListeners = this.listeners.get(event);
        if (eventListeners) {
            this.listeners.set(
                event,
                eventListeners.filter((h) => h !== handler)
            );
        }
    }

    /**
     * Emit an event. All listeners are invoked asynchronously.
     * Use `emitSync` if you need to block on listener completion.
     */
    emit<T = any>(event: string, payload: T): void {
        const eventListeners = this.listeners.get(event);
        if (eventListeners) {
            for (const handler of eventListeners) {
                // Fire and forget (errors should be caught by the handler or a global process handler)
                Promise.resolve(handler(payload)).catch((err) => {
                    console.error(`[EventEmitter] Unhandled error in listener for event '${event}':`, err);
                });
            }
        }
    }

    /**
     * Emit an event and wait for all listeners to complete.
     */
    async emitSync<T = any>(event: string, payload: T): Promise<void> {
        const eventListeners = this.listeners.get(event);
        if (eventListeners) {
            await Promise.all(eventListeners.map((handler) => handler(payload)));
        }
    }
}

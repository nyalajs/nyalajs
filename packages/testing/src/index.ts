export * from "./testing-module";
export * from "./http-test-client";

/**
 * Create a lightweight mock object typed as T.
 * Useful for overriding providers in tests.
 * Works with Jest, Vitest, or any other test runner.
 */
export function createMock<T>(partial: Partial<T> = {}): T {
    return partial as T;
}

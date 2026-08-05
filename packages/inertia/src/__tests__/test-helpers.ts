import { SessionLike } from "../flash";
import { InertiaResponseRequest } from "../inertia-response";

/** In-memory fake of @fastify/secure-session's session object, for tests. */
export function fakeSession(initial: Record<string, unknown> = {}): SessionLike {
    const store = { ...initial };
    return {
        get: (key: string) => store[key],
        set: (key: string, value: unknown) => {
            store[key] = value;
        },
    };
}

export function fakeRequest(overrides: {
    headers?: Record<string, string | string[] | undefined>;
    url?: string;
    session?: SessionLike;
} = {}): InertiaResponseRequest {
    return {
        headers: overrides.headers ?? {},
        url: overrides.url ?? "/",
        session: overrides.session,
        __inertiaShared: undefined,
    };
}

export function fakeReply() {
    const headers: Record<string, string> = {};
    return {
        headers,
        header: (name: string, value: string) => {
            headers[name] = value;
        },
    };
}

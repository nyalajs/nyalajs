/**
 * Session-backed, read-once flash messages (e.g. "Post created" after a
 * redirect). Built on @fastify/secure-session's `.get`/`.set` — the same
 * session object templates/cms-starter's SessionAuthGuard already reads
 * (`request.session.get("userId")`) — not a new storage mechanism.
 *
 * "Read-once" is implemented by deleting the flash key from the session as
 * soon as it's read, so a message set before a redirect shows up exactly
 * once on the very next request, not on every request until overwritten.
 */
export interface SessionLike {
    get(key: string): unknown;
    set(key: string, value: unknown): void;
}

export interface FlashRequestLike {
    session?: SessionLike;
}

const FLASH_SESSION_KEY = "__nyala_flash";

/** Stores a flash message in the session, to be read (and cleared) on the next request. */
export function flash(request: FlashRequestLike, key: string, value: unknown): void {
    if (!request.session) {
        throw new Error(
            "[@nyalajs/inertia] flash() requires sessions to be enabled " +
            "(FastifyAdapter's `session` option, default true)."
        );
    }

    const existing = (request.session.get(FLASH_SESSION_KEY) as Record<string, unknown>) ?? {};
    request.session.set(FLASH_SESSION_KEY, { ...existing, [key]: value });
}

/**
 * Reads and clears all flash data for the current request. Called once per
 * request by InertiaResponse to populate the page object's `flash` prop —
 * controllers/middleware don't normally need to call this directly.
 */
export function consumeFlash(request: FlashRequestLike): Record<string, unknown> {
    if (!request.session) return {};

    const data = (request.session.get(FLASH_SESSION_KEY) as Record<string, unknown>) ?? {};
    if (Object.keys(data).length > 0) {
        request.session.set(FLASH_SESSION_KEY, {});
    }
    return data;
}

const VALIDATION_ERRORS_SESSION_KEY = "__nyala_validation_errors";

/**
 * Flashes validation errors into the session, to be picked up as
 * `props.errors` on the very next InertiaResponse render (read-once, same
 * mechanism as flash()). This is the real Inertia validation-error
 * pattern: a controller catches a validation failure, redirects back
 * (303) to the form page, and the errors travel via session — not a
 * same-request re-render — so a Post/Redirect/Get cycle plays nicely with
 * the browser's back button and Inertia's own history handling.
 *
 * @example
 *   @Post("/posts")
 *   async create(@Body() dto: unknown, @Req() req, @Res() res) {
 *       const parsed = CreatePostValidator.safeParse(dto);
 *       if (!parsed.success) {
 *           flashValidationErrors(req, zodErrorsToInertia(parsed.error));
 *           return res.redirect(303, "/posts/create");
 *       }
 *       ...
 *   }
 */
export function flashValidationErrors(request: FlashRequestLike, errors: Record<string, string | string[]>): void {
    if (!request.session) {
        throw new Error(
            "[@nyalajs/inertia] flashValidationErrors() requires sessions to be enabled " +
            "(FastifyAdapter's `session` option, default true)."
        );
    }
    request.session.set(VALIDATION_ERRORS_SESSION_KEY, errors);
}

/** Reads and clears flashed validation errors. Called by InertiaResponse to populate `props.errors`. */
export function consumeValidationErrors(request: FlashRequestLike): Record<string, string | string[]> {
    if (!request.session) return {};

    const data = (request.session.get(VALIDATION_ERRORS_SESSION_KEY) as Record<string, string | string[]>) ?? {};
    if (Object.keys(data).length > 0) {
        request.session.set(VALIDATION_ERRORS_SESSION_KEY, {});
    }
    return data;
}

/**
 * Converts a Zod SafeParseError's `.error` (a ZodError) into the flat
 * { field: message } shape Inertia's client expects for `props.errors` —
 * matching @nyalajs/validation's own error-formatting convention (see
 * packages/http/src/runtime/fastify-adapter.ts's validateRequest(), which
 * maps ZodError.issues the same way for its JSON error responses).
 */
export function zodErrorsToInertia(error: { issues: Array<{ path: (string | number)[]; message: string }> }): Record<string, string> {
    const result: Record<string, string> = {};
    for (const issue of error.issues) {
        const key = issue.path.join(".") || "_";
        // First message per field wins — matches how most Inertia form UIs
        // render one error string under each field, not an array.
        if (!(key in result)) {
            result[key] = issue.message;
        }
    }
    return result;
}

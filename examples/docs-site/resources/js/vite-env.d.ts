/// <reference types="vite/client" />

/**
 * Injected by vite.config.ts's `define` — a real compile-time constant
 * tied to Vite's own build `command` ("build" vs "serve"), not to
 * import.meta.env.DEV/PROD (those track Vite's *mode*, derived from
 * NODE_ENV, which is a separate axis — see vite.config.ts's own comment
 * for the real bug this distinction fixes).
 */
declare const __NYALA_IS_VITE_BUILD__: boolean;

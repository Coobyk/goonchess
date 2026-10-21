/// <reference types="vite/client" />

/** Short git commit the bundle was built from (full SHA when available). */
declare const __BUILD_COMMIT__: string
/** ISO timestamp of the build. */
declare const __BUILD_TIME__: string
/**
 * The build mode.
 *
 * Vite replaces this in the bundle, but the components that check it — the
 * Dither Kit among them — are read as plain source, so the type has to be
 * here for them to compile.
 */
declare const process: { env: { NODE_ENV?: string } }

// Build-time settings. `VITE_*` values are public and baked in at build: include https://, never put secrets here.
const env = import.meta.env as Record<string, string | undefined>

/** The Worker's address for push, sync and the ping. Empty: not configured (local development). */
// VITE_SYNC_URL was the old name of the same value; the fallback can go after one release.
export const API_URL: string = (env.VITE_API_URL ?? env.VITE_SYNC_URL ?? '').replace(/\/+$/, '')

/** The VAPID public key (base64url) the Worker signs pushes with. Empty: not configured. */
export const VAPID_PUBLIC_KEY: string = env.VITE_VAPID_PUBLIC_KEY ?? ''

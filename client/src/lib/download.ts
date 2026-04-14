/**
 * URL for the Mac installer (DMG or similar). Override in production with
 * `VITE_MAC_DOWNLOAD_URL` (absolute or site-relative, e.g. `/downloads/flowlock.dmg`).
 */
export const MAC_DOWNLOAD_URL: string =
  (import.meta.env.VITE_MAC_DOWNLOAD_URL as string | undefined)?.trim() ||
  "/downloads/flowlock.dmg";

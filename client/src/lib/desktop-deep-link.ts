/**
 * Desktop auth deep link. Include `backend` so the Zirain app uses the same API
 * origin as this site (must match the API host the desktop app uses).
 */
export function buildDesktopAuthDeepLink(userId: string): string {
  const backend = encodeURIComponent(window.location.origin);
  return `zirain://auth?userId=${encodeURIComponent(userId)}&backend=${backend}`;
}

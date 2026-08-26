const SAME_ORIGIN = "http://localhost";

export function safeRelativePath(value: unknown, fallback = "/"): string {
  if (typeof value !== "string" || value.length === 0) return fallback;
  try {
    const url = new URL(value, SAME_ORIGIN);
    if (url.origin !== SAME_ORIGIN || !url.pathname.startsWith("/")) return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}

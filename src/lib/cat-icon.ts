export const CAT_ICON_PROXY_PREFIX = "/api/cat-icons/";

const PRIVATE_CAT_ICON_PATH_PATTERN =
  /^cats\/[a-z0-9-]+\/[0-9a-f-]{36}\.(?:jpg|png|webp)$/i;

export function isPrivateCatIconPath(pathname: string): boolean {
  return PRIVATE_CAT_ICON_PATH_PATTERN.test(pathname);
}

export function isCatIconImage(value: string): boolean {
  return /^https?:\/\//i.test(value) || isCatIconProxyUrl(value);
}

export function catIconProxyUrl(pathname: string): string {
  return `${CAT_ICON_PROXY_PREFIX}${pathname
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/")}`;
}

export function isCatIconProxyUrl(value: string): boolean {
  if (!value.startsWith(CAT_ICON_PROXY_PREFIX)) return false;
  const encodedPath = value.slice(CAT_ICON_PROXY_PREFIX.length);
  const pathname = encodedPath
    .split("/")
    .map((segment) => {
      try {
        return decodeURIComponent(segment);
      } catch {
        return "";
      }
    })
    .join("/");
  return isPrivateCatIconPath(pathname);
}

export function privateCatIconPathFromUrl(value: string): string | null {
  if (!isCatIconProxyUrl(value)) return null;
  const encodedPath = value.slice(CAT_ICON_PROXY_PREFIX.length);
  return encodedPath
    .split("/")
    .map((segment) => decodeURIComponent(segment))
    .join("/");
}

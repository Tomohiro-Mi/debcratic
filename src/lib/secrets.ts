const DEV_AUTH_SECRET = "dev-insecure-secret-change-me";

export function getAuthSecret(): string {
  const secret = process.env.AUTH_SECRET?.trim();
  if (process.env.NODE_ENV === "production" && (!secret || secret.length < 32)) {
    throw new Error("AUTH_SECRET must be set to at least 32 characters in production");
  }
  return secret || DEV_AUTH_SECRET;
}

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

function derivedKey(): Buffer {
  const secret =
    process.env.AUTH_SECRET || "dev-insecure-secret-change-me-in-production";
  return createHash("sha256")
    .update(`debcratic:secret-box:${secret}`)
    .digest();
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", derivedKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${tag.toString("hex")}:${enc.toString("hex")}`;
}

export function decryptSecret(stored: string): string | null {
  try {
    const [ivHex, tagHex, dataHex] = stored.split(":");
    if (!ivHex || !tagHex || !dataHex) return null;
    const decipher = createDecipheriv(
      "aes-256-gcm",
      derivedKey(),
      Buffer.from(ivHex, "hex"),
    );
    decipher.setAuthTag(Buffer.from(tagHex, "hex"));
    return Buffer.concat([
      decipher.update(Buffer.from(dataHex, "hex")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return null;
  }
}

export function maskSecret(plain: string): string {
  if (plain.length <= 8) return "…";
  return `…${plain.slice(-4)}`;
}

export const CAT_ICON_MAX_BYTES = 2 * 1024 * 1024;

const IMAGE_SIGNATURES = {
  "image/jpeg": (bytes: Uint8Array) => bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff,
  "image/png": (bytes: Uint8Array) =>
    bytes.length >= 8 && bytes.slice(0, 8).every((byte, i) => byte === [137, 80, 78, 71, 13, 10, 26, 10][i]),
  "image/webp": (bytes: Uint8Array) =>
    bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP",
} as const;

export async function validateCatIconFile(
  entry: FormDataEntryValue | null,
): Promise<{ file: File; extension: "jpg" | "png" | "webp" } | null> {
  if (typeof File === "undefined" || !(entry instanceof File) || entry.size === 0) {
    return null;
  }
  if (entry.size > CAT_ICON_MAX_BYTES) {
    throw new Error("画像は2MB以下にしてください");
  }
  const signatureCheck = IMAGE_SIGNATURES[entry.type as keyof typeof IMAGE_SIGNATURES];
  if (!signatureCheck) {
    throw new Error("対応形式はJPEG・PNG・WebPです");
  }
  const bytes = new Uint8Array(await entry.arrayBuffer());
  if (!signatureCheck(bytes)) {
    throw new Error("画像ファイルの内容を確認できませんでした");
  }
  return {
    file: entry,
    extension: entry.type === "image/jpeg" ? "jpg" : entry.type.slice("image/".length) as "png" | "webp",
  };
}

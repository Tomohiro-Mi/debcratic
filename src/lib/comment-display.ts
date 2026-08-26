import { SILENT_CAT_COMMENT } from "@/lib/constants";

export function displayCatComment(
  reason: string,
  silent: boolean,
  silentComment?: string,
): string {
  return silent ? silentComment?.trim() || SILENT_CAT_COMMENT : reason;
}

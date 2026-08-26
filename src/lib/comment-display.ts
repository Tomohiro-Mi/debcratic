import { SILENT_CAT_COMMENT } from "@/lib/constants";

export function displayCatComment(reason: string, silent: boolean): string {
  return silent ? SILENT_CAT_COMMENT : reason;
}

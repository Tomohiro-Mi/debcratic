import { z } from "zod";

export const registerSchema = z.object({
  name: z.string().trim().min(1, "名前を入力してください").max(30),
  email: z.string().trim().email("メールアドレスの形式が正しくありません").max(200),
  password: z.string().min(8, "パスワードは8文字以上にしてください").max(100),
});

export const loginSchema = z.object({
  email: z.string().trim().email("メールアドレスの形式が正しくありません"),
  password: z.string().min(1, "パスワードを入力してください"),
});

export const opinionContentSchema = z
  .string()
  .trim()
  .min(1, "意見を入力してください")
  .max(2000, "意見は2000文字以内にしてください");

export const uuidSchema = z.string().uuid();

export function parseDateTimeLocal(raw: string, timezoneOffsetRaw: unknown): Date {
  if (!raw || /(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw)) return new Date(raw);
  const match = raw.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?$/,
  );
  if (!match) return new Date(raw);

  const [, year, month, day, hour, minute, second = "0", fraction = ""] = match;
  const milliseconds = Number(`0.${fraction}`) * 1000 || 0;
  const wallClock = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
    milliseconds,
  );
  const wallDate = new Date(wallClock);
  if (
    wallDate.getUTCFullYear() !== Number(year) ||
    wallDate.getUTCMonth() !== Number(month) - 1 ||
    wallDate.getUTCDate() !== Number(day) ||
    wallDate.getUTCHours() !== Number(hour) ||
    wallDate.getUTCMinutes() !== Number(minute) ||
    wallDate.getUTCSeconds() !== Number(second)
  ) {
    return new Date(Number.NaN);
  }

  const timezoneOffset = Number(timezoneOffsetRaw);
  if (!Number.isFinite(timezoneOffset) || Math.abs(timezoneOffset) > 24 * 60) {
    return new Date(raw);
  }
  return new Date(wallClock + timezoneOffset * 60_000);
}

export function slugify(input: string): string {
  const base = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);
  if (!base) return `cat-${Math.random().toString(36).slice(2, 8)}`;
  return base;
}

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

export function slugify(input: string): string {
  const base = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);
  if (!base) return `cat-${Math.random().toString(36).slice(2, 8)}`;
  return base;
}

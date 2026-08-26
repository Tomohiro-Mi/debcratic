"use server";

import { redirect } from "next/navigation";
import {
  countUsers,
  createSessionCookie,
  destroySessionCookie,
  findUserByEmail,
  hashPassword,
  verifyPassword,
} from "@/lib/auth";
import { registerSchema, loginSchema } from "@/lib/validation";
import { users } from "@/db/schema";
import { getDb } from "@/db";

export interface AuthActionState {
  error?: string;
}

function safeNext(fd: FormData): string {
  const n = String(fd.get("next") ?? "");
  return n.startsWith("/") ? n : "/";
}

export async function registerAction(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = registerSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "入力内容を確認してください" };
  }
  const { name, email, password } = parsed.data;
  if (await findUserByEmail(email)) {
    return { error: "このメールアドレスは既に登録されています" };
  }
  const isFirst = (await countUsers()) === 0;
  const adminEmail = process.env.ADMIN_EMAIL?.toLowerCase();
  const role =
    isFirst || (adminEmail && email.toLowerCase() === adminEmail)
      ? ("admin" as const)
      : ("user" as const);
  const [user] = await getDb()
    .insert(users)
    .values({
      name,
      email: email.toLowerCase(),
      passwordHash: await hashPassword(password),
      role,
    })
    .returning();
  await createSessionCookie(user.id, user.role, user.name);
  redirect(safeNext(formData));
}

export async function loginAction(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "入力内容を確認してください" };
  }
  const user = await findUserByEmail(parsed.data.email);
  if (!user || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
    return { error: "メールアドレスまたはパスワードが違います" };
  }
  if (user.bannedAt) {
    return { error: "このアカウントは停止されています" };
  }
  await createSessionCookie(user.id, user.role, user.name);
  redirect(safeNext(formData));
}

export async function logoutAction() {
  await destroySessionCookie();
  redirect("/");
}

"use server";

import { redirect } from "next/navigation";
import { sql } from "drizzle-orm";
import {
  createSessionCookie,
  destroySessionCookie,
  findUserByEmail,
  hashPassword,
  verifyPassword,
} from "@/lib/auth";
import { registerSchema, loginSchema } from "@/lib/validation";
import { users } from "@/db/schema";
import { getDb } from "@/db";
import { safeRelativePath } from "@/lib/security";

export interface AuthActionState {
  error?: string;
}

function safeNext(fd: FormData): string {
  return safeRelativePath(fd.get("next"));
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
  const adminEmail = process.env.ADMIN_EMAIL?.toLowerCase().trim();
  if (process.env.NODE_ENV === "production" && !adminEmail) {
    return { error: "管理者メールが未設定のため、現在は登録できません" };
  }
  const created = await getDb().transaction(async (tx) => {
    // Serialize signup decisions so two simultaneous first signups cannot both become admins.
    await tx.execute(sql`select pg_advisory_xact_lock(19790216)`);
    const existing = await tx
      .select({ id: users.id })
      .from(users)
      .where(sql`${users.email} = ${email.toLowerCase()}`)
      .limit(1);
    if (existing.length > 0) return { user: null, duplicate: true } as const;

    const countRows = await tx.select({ n: sql<number>`count(*)` }).from(users);
    const isFirst = Number(countRows[0]?.n ?? 0) === 0;
    const role =
      (adminEmail && email.toLowerCase() === adminEmail) || (!adminEmail && isFirst)
        ? ("admin" as const)
        : ("user" as const);
    const [user] = await tx
      .insert(users)
      .values({
        name,
        email: email.toLowerCase(),
        passwordHash: await hashPassword(password),
        role,
      })
      .returning();
    return { user, duplicate: false } as const;
  });

  if (created.duplicate || !created.user) {
    return { error: "このメールアドレスは既に登録されています" };
  }
  const user = created.user;
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

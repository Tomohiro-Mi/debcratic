"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { sql } from "drizzle-orm";
import {
  createSessionCookie,
  destroySessionCookie,
  findUserByEmail,
  getSession,
  hashPassword,
  verifyPassword,
} from "@/lib/auth";
import {
  changePasswordSchema,
  loginSchema,
  registerSchema,
  updateAccountNameSchema,
} from "@/lib/validation";
import { users } from "@/db/schema";
import { getDb } from "@/db";
import { safeRelativePath } from "@/lib/security";

export interface AuthActionState {
  error?: string;
  success?: string;
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
  await createSessionCookie(user.id, user.role, user.name, user.sessionVersion);
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
  await createSessionCookie(user.id, user.role, user.name, user.sessionVersion);
  redirect(safeNext(formData));
}

async function findCurrentUser(userId: string) {
  return (
    await getDb()
      .select({
        id: users.id,
        name: users.name,
        role: users.role,
        passwordHash: users.passwordHash,
        sessionVersion: users.sessionVersion,
      })
      .from(users)
      .where(sql`${users.id} = ${userId}`)
      .limit(1)
  )[0] ?? null;
}

export async function updateAccountNameAction(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const session = await getSession();
  if (!session) return { error: "ログインが必要です" };

  const parsed = updateAccountNameSchema.safeParse({
    name: formData.get("name"),
    currentPassword: formData.get("currentPassword"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "入力内容を確認してください" };
  }

  const user = await findCurrentUser(session.userId);
  if (!user || !(await verifyPassword(parsed.data.currentPassword, user.passwordHash))) {
    return { error: "現在のパスワードが違います" };
  }

  if (user.name === parsed.data.name) {
    return { success: "ユーザー名は変更されていません" };
  }

  await getDb().update(users).set({ name: parsed.data.name }).where(sql`${users.id} = ${user.id}`);
  await createSessionCookie(user.id, user.role, parsed.data.name, user.sessionVersion);
  revalidatePath("/", "layout");
  return { success: "ユーザー名を変更しました" };
}

export async function changePasswordAction(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const session = await getSession();
  if (!session) return { error: "ログインが必要です" };

  const parsed = changePasswordSchema.safeParse({
    currentPassword: formData.get("currentPassword"),
    newPassword: formData.get("newPassword"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "入力内容を確認してください" };
  }

  const user = await findCurrentUser(session.userId);
  if (!user || !(await verifyPassword(parsed.data.currentPassword, user.passwordHash))) {
    return { error: "現在のパスワードが違います" };
  }
  if (await verifyPassword(parsed.data.newPassword, user.passwordHash)) {
    return { error: "現在と異なるパスワードを設定してください" };
  }

  const [updated] = await getDb()
    .update(users)
    .set({
      passwordHash: await hashPassword(parsed.data.newPassword),
      sessionVersion: sql`${users.sessionVersion} + 1`,
    })
    .where(sql`${users.id} = ${user.id}`)
    .returning({
      id: users.id,
      name: users.name,
      role: users.role,
      sessionVersion: users.sessionVersion,
    });
  if (!updated) return { error: "パスワードの変更に失敗しました" };

  await createSessionCookie(updated.id, updated.role, updated.name, updated.sessionVersion);
  revalidatePath("/", "layout");
  return { success: "パスワードを変更しました。他の端末のログインも終了しました" };
}

export async function logoutAction() {
  await destroySessionCookie();
  redirect("/");
}

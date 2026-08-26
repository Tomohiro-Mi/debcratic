import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { eq, sql } from "drizzle-orm";
import { users } from "@/db/schema";
import { getDb } from "@/db";

const COOKIE_NAME = "dnk_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

function secretKey(): Uint8Array {
  const secret =
    process.env.AUTH_SECRET || "dev-insecure-secret-change-me-in-production";
  return new TextEncoder().encode(secret);
}

export interface SessionInfo {
  userId: string;
  role: "user" | "admin";
  name: string;
}

export async function createSessionCookie(userId: string, role: "user" | "admin", name: string) {
  const token = await new SignJWT({ role, name })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SECONDS}s`)
    .sign(secretKey());
  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function destroySessionCookie() {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

export const getSession = cache(async (): Promise<SessionInfo | null> => {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey());
    if (!payload.sub) return null;
    return {
      userId: payload.sub,
      role: (payload.role as "user" | "admin") ?? "user",
      name: (payload.name as string) ?? "",
    };
  } catch {
    return null;
  }
});

export async function requireUser(nextPath = "/"): Promise<SessionInfo> {
  const session = await getSession();
  if (!session) redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  return session;
}

export async function requireAdmin(nextPath = "/admin"): Promise<SessionInfo> {
  const session = await requireUser(nextPath);
  if (session.role !== "admin") redirect("/");
  return session;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function countUsers(): Promise<number> {
  const rows = await getDb().select({ n: sql<number>`count(*)` }).from(users);
  return Number(rows[0]?.n ?? 0);
}

export async function findUserByEmail(email: string) {
  const rows = await getDb()
    .select()
    .from(users)
    .where(eq(users.email, email.toLowerCase().trim()))
    .limit(1);
  return rows[0] ?? null;
}

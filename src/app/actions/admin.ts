"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import {
  cats,
  opinions,
  proposals,
  reports,
  systemSettings,
  users,
} from "@/db/schema";
import { getDb } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { slugify } from "@/lib/validation";

export interface AdminActionState {
  error?: string;
  success?: string;
}

export async function upsertCatAction(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  await requireAdmin();

  const idRaw = String(formData.get("id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const type = String(formData.get("type") ?? "").trim();
  const icon = String(formData.get("icon") ?? "🐱").trim().slice(0, 8) || "🐱";
  const gender = String(formData.get("gender") ?? "不明").trim().slice(0, 10) || "不明";
  const power = Math.max(1, Math.min(10, Number(formData.get("power") ?? 1) || 1));

  const params: Record<string, number> = {};
  for (const [key, value] of formData.entries()) {
    if (key.startsWith("pp:")) {
      const pname = key.slice(3).trim();
      if (!pname) continue;
      const n = Number(value);
      if (Number.isFinite(n)) params[pname] = Math.max(1, Math.min(10, Math.round(n)));
    }
  }
  if (!name || !type) return { error: "名前と種類は必須です" };
  if (Object.keys(params).length === 0) {
    return { error: "恒久パラメータを1つ以上設定してください" };
  }

  try {
    if (idRaw) {
      await getDb()
        .update(cats)
        .set({ name, type, icon, gender, power, permanentParams: params })
        .where(eq(cats.id, idRaw));
    } else {
      const base = slugify(name);
      let id = base;
      let i = 2;
      while ((await getDb().select({ x: cats.id }).from(cats).where(eq(cats.id, id)).limit(1)).length > 0) {
        id = `${base}-${i++}`;
      }
      await getDb()
        .insert(cats)
        .values({
          id,
          name,
          type,
          icon,
          gender,
          power,
          permanentParams: params,
        });
    }
  } catch (err) {
    console.error("[upsertCat]", err);
    return { error: "保存に失敗しました" };
  }

  revalidatePath("/admin");
  revalidatePath("/cats");
  return { success: `猫「${name}」を保存しました` };
}

export async function toggleCatActiveAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get("catId") ?? "");
  const cat = (await getDb().select().from(cats).where(eq(cats.id, id)).limit(1))[0];
  if (!cat) return;
  await getDb().update(cats).set({ active: !cat.active }).where(eq(cats.id, id));
  revalidatePath("/admin");
  revalidatePath("/cats");
}

export async function saveSettingsAction(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  await requireAdmin();

  const numOrNull = (key: string, min: number, max: number): number | null => {
    const raw = formData.get(key);
    if (raw === null || String(raw).trim() === "") return null;
    const n = Number(raw);
    if (!Number.isFinite(n)) return null;
    return Math.max(min, Math.min(max, n));
  };

  const values = {
    llmModel: String(formData.get("llmModel") ?? "").trim() || null,
    temperature: numOrNull("temperature", 0, 2),
    exilePenaltyProb: numOrNull("exilePenaltyProb", 0, 1),
    assimilationProb: numOrNull("assimilationProb", 0, 1),
    assimilationMinTurns: numOrNull("assimilationMinTurns", 1, 50),
    changeWindow: numOrNull("changeWindow", 1, 50),
    changeThreshold: numOrNull("changeThreshold", 1, 10),
    runoffTurnLimit: numOrNull("runoffTurnLimit", 1, 20),
    updatedAt: new Date(),
  };

  await getDb()
    .insert(systemSettings)
    .values({ id: 1, ...values })
    .onConflictDoUpdate({ target: systemSettings.id, set: values });

  revalidatePath("/admin");
  return { success: "設定を保存しました" };
}

export async function resolveReportAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = Number(formData.get("reportId"));
  if (!Number.isFinite(id)) return;
  await getDb()
    .update(reports)
    .set({ resolvedAt: new Date() })
    .where(eq(reports.id, id));
  revalidatePath("/admin");
}

export async function moderateOpinionAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const opinionId = String(formData.get("opinionId") ?? "");
  const op = (
    await getDb().select().from(opinions).where(eq(opinions.id, opinionId)).limit(1)
  )[0];
  if (!op) return;
  await getDb()
    .update(opinions)
    .set({ deletedAt: new Date(), eligible: false })
    .where(eq(opinions.id, opinionId));
  revalidatePath("/admin");
  revalidatePath(`/proposals/${op.proposalId}`);
}

export async function moderateProposalAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const proposalId = String(formData.get("proposalId") ?? "");
  const p = (
    await getDb().select().from(proposals).where(eq(proposals.id, proposalId)).limit(1)
  )[0];
  if (!p) return;
  await getDb()
    .update(proposals)
    .set({ deletedAt: new Date(), status: "CLOSED" })
    .where(eq(proposals.id, proposalId));
  revalidatePath("/admin");
  revalidatePath("/");
}

export async function toggleBanUserAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const userId = String(formData.get("userId") ?? "");
  const user = (await getDb().select().from(users).where(eq(users.id, userId)).limit(1))[0];
  if (!user || user.role === "admin") return;
  await getDb()
    .update(users)
    .set({ bannedAt: user.bannedAt ? null : new Date() })
    .where(eq(users.id, userId));
  revalidatePath("/admin");
}

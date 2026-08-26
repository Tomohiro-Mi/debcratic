"use server";

import { revalidatePath } from "next/cache";
import { and, desc, eq, inArray, isNull, max } from "drizzle-orm";
import { put } from "@vercel/blob";
import { randomUUID } from "node:crypto";
import {
  cats,
  events,
  factionMemberships,
  factions,
  opinions,
  proposals,
  reports,
  systemSettings,
  turns,
  users,
} from "@/db/schema";
import { getDb } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { slugify, uuidSchema } from "@/lib/validation";
import { encryptSecret } from "@/lib/crypto";
import { getEffectiveSettings, VOTE_INTERVAL_SETTINGS_ID } from "@/lib/settings";
import { testLlmConnection } from "@/lib/llm";
import { DEFAULTS } from "@/lib/constants";
import { validateCatIconFile } from "@/lib/image-upload";

export interface AdminActionState {
  error?: string;
  success?: string;
}

async function uploadCatIcon(file: FormDataEntryValue, name: string): Promise<string | null> {
  const validated = await validateCatIconFile(file);
  if (!validated) return null;
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error("画像アップロードが未設定です（BLOB_READ_WRITE_TOKENを設定してください）");
  }

  const { file: imageFile, extension } = validated;
  const pathname = `cats/${slugify(name) || "cat"}/${randomUUID()}.${extension}`;
  const blob = await put(pathname, imageFile, {
    access: "public",
    addRandomSuffix: false,
    contentType: imageFile.type,
    cacheControlMaxAge: 31536000,
  });
  return blob.url;
}

export async function upsertCatAction(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  await requireAdmin();

  const idRaw = String(formData.get("id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim().slice(0, 60);
  const iconInput = String(formData.get("icon") ?? "🐱").trim().slice(0, 1000);
  const iconUrlRaw = String(formData.get("iconUrl") ?? "").trim().slice(0, 1000);
  const genderRaw = String(formData.get("gender") ?? "セン").trim();
  const gender = ["オス", "メス", "セン"].includes(genderRaw)
    ? (genderRaw as "オス" | "メス" | "セン")
    : null;
  const powerRaw = Number(formData.get("power") ?? 1);
  const power = Number.isFinite(powerRaw)
    ? Math.max(1, Math.min(10, Math.round(powerRaw)))
    : 1;
  const factionIdRaw = String(formData.get("factionId") ?? "").trim();
  const factionId = factionIdRaw || null;

  let iconUrl: string | null = null;
  if (iconUrlRaw) {
    try {
      const parsed = new URL(iconUrlRaw);
      if (parsed.protocol !== "https:") {
        return { error: "アイコン画像URLはHTTPSで指定してください" };
      }
      iconUrl = parsed.toString();
    } catch {
      return { error: "アイコン画像URLの形式が正しくありません" };
    }
  }
  if (!name) return { error: "名前は必須です" };
  if (!gender) return { error: "性別を選択してください" };
  if (factionId && !uuidSchema.safeParse(factionId).success) {
    return { error: "初期所属派閥の指定が正しくありません" };
  }
  let uploadedIconUrl: string | null = null;
  try {
    uploadedIconUrl = await uploadCatIcon(formData.get("iconFile") ?? "", name);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "画像アップロードに失敗しました" };
  }
  // Keep the image URL in the existing icon column so old production databases
  // can deploy this feature without a blocking schema migration.
  const icon = uploadedIconUrl ?? iconUrl ?? (iconInput.slice(0, 16) || "🐱");

  try {
    const db = getDb();
    const selectedFaction = factionId
      ? (
          await db
            .select()
            .from(factions)
            .where(and(eq(factions.id, factionId), eq(factions.status, "active")))
            .limit(1)
        )[0]
      : null;
    if (factionId && !selectedFaction) return { error: "初期所属派閥が見つかりません" };

    await db.transaction(async (tx) => {
      let id = idRaw;
      if (!id) {
        const base = slugify(name);
        id = base;
        let i = 2;
        while ((await tx.select({ x: cats.id }).from(cats).where(eq(cats.id, id)).limit(1)).length > 0) {
          id = `${base}-${i++}`;
        }
        await tx.insert(cats).values({ id, name, icon, gender, power });
      } else {
        const existing = (await tx.select({ id: cats.id }).from(cats).where(eq(cats.id, id)).limit(1))[0];
        if (!existing) throw new Error("cat not found");
        await tx
          .update(cats)
          .set({ name, icon, gender, power })
          .where(eq(cats.id, id));
      }

      const currentMembership = (
        await tx
          .select({ membership: factionMemberships, factionLeaderId: factions.leaderId })
          .from(factionMemberships)
          .innerJoin(factions, eq(factionMemberships.factionId, factions.id))
          .where(and(eq(factionMemberships.catId, id), isNull(factionMemberships.leftTurn)))
          .orderBy(desc(factionMemberships.joinedTurn))
          .limit(1)
      )[0];
      const currentFactionId = currentMembership?.membership.factionId ?? null;
      let factionEvent: { type: string; payload: Record<string, unknown> } | null = null;
      let assignmentTurn = 0;

      if (currentFactionId !== factionId) {
        const latestTurn = Number(
          (await tx.select({ value: max(turns.number) }).from(turns))[0]?.value ?? -1,
        );
        const changeTurn = latestTurn + 1;
        assignmentTurn = changeTurn;
        if (currentMembership) {
          await tx
            .update(factionMemberships)
            .set({ leftTurn: changeTurn })
            .where(eq(factionMemberships.id, currentMembership.membership.id));
          factionEvent = {
            type: "FactionLeft",
            payload: { cat_id: id, cat_name: name, reason: "admin_assignment" },
          };
        }
        if (selectedFaction) {
          const role = selectedFaction.leaderId === id ? "leader" : "follower";
          await tx.insert(factionMemberships).values({
            factionId: selectedFaction.id,
            catId: id,
            role,
            joinedTurn: changeTurn,
          });
          factionEvent = {
            type: "FactionJoined",
            payload: {
              cat_id: id,
              cat_name: name,
              faction: selectedFaction.name,
              reason: "admin_assignment",
            },
          };
        }
      }

      await tx
        .update(cats)
        .set({
          factionId: selectedFaction?.id ?? null,
          leaderId: selectedFaction?.leaderId ?? null,
        })
        .where(eq(cats.id, id));
      if (factionEvent) {
        await tx.insert(events).values({
          turnNumber: assignmentTurn,
          type: factionEvent.type,
          payload: factionEvent.payload,
        });
      }
    });
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

  const values: typeof systemSettings.$inferInsert = {
    llmModel: String(formData.get("llmModel") ?? "").trim() || null,
    temperature: numOrNull("temperature", 0, 2),
    exilePenaltyProb: numOrNull("exilePenaltyProb", 0, 1),
    changeWindow: numOrNull("changeWindow", 1, 50),
    changeThreshold: numOrNull("changeThreshold", 1, 10),
    runoffTurnLimit: numOrNull("runoffTurnLimit", 1, 20),
    updatedAt: new Date(),
  };

  const wantsClear = formData.get("clearApiKey") === "1";
  const rawKey = String(formData.get("llmApiKey") ?? "").trim();
  if (wantsClear) {
    values.llmApiKeyEnc = null;
  } else if (rawKey) {
    values.llmApiKeyEnc = encryptSecret(rawKey);
  }

  const db = getDb();
  const intervalMinutes = numOrNull("voteIntervalMinutes", 1, 10080) ?? DEFAULTS.voteIntervalMinutes;
  const intervalMs = intervalMinutes * 60_000;
  await db.transaction(async (tx) => {
    await tx
      .insert(systemSettings)
      .values({ id: 1, ...values })
      .onConflictDoUpdate({ target: systemSettings.id, set: values });
    await tx
      .insert(systemSettings)
      .values({
        id: VOTE_INTERVAL_SETTINGS_ID,
        runoffTurnLimit: intervalMinutes,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: systemSettings.id,
        set: { runoffTurnLimit: intervalMinutes, updatedAt: new Date() },
      });

    // Apply a changed interval to currently open proposals too. Their next
    // schedule is based on the last vote, so changing the setting takes effect
    // without waiting for the old schedule to fire once more.
    const activeProposalRows = await tx
      .select({ id: proposals.id })
      .from(proposals)
      .where(eq(proposals.status, "OPEN"));
    const activeProposalIds = activeProposalRows.map((p) => p.id);
    if (activeProposalIds.length > 0) {
      const activeOpinions = await tx
        .select({
          id: opinions.id,
          createdAt: opinions.createdAt,
          lastVotedAt: opinions.lastVotedAt,
        })
        .from(opinions)
        .where(
          and(
            eq(opinions.eligible, true),
            isNull(opinions.deletedAt),
            inArray(opinions.proposalId, activeProposalIds),
          ),
        );
      for (const opinion of activeOpinions) {
        const base = opinion.lastVotedAt ?? opinion.createdAt;
        await tx
          .update(opinions)
          .set({ nextVoteDue: new Date(base.getTime() + intervalMs) })
          .where(eq(opinions.id, opinion.id));
      }
    }
  });

  revalidatePath("/admin");
  if (wantsClear) return { success: "APIキーを削除しました" };
  if (rawKey) return { success: "設定を保存しました（APIキー更新済み）" };
  return { success: "設定を保存しました" };
}

export async function testLlmConnectionAction(
  _prev: AdminActionState,
  _formData: FormData,
): Promise<AdminActionState> {
  await requireAdmin();
  const s = await getEffectiveSettings();
  if (!s.apiKey) {
    return { error: "APIキーが未設定です（現在はデモモードで動作中）" };
  }
  const result = await testLlmConnection(s.apiKey, s.llmModel);
  if (result.ok) {
    return { success: `接続OK: ${result.model} で投票できます 🐾` };
  }
  return { error: `接続失敗: ${result.error}` };
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

"use server";

import { revalidatePath } from "next/cache";
import { and, desc, eq, inArray, isNull, max, sql } from "drizzle-orm";
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
import {
  getEffectiveSettings,
  RUNOFF_INTERVAL_SETTINGS_ID,
  VOTE_INTERVAL_AFTER_MONTH_SETTINGS_ID,
  VOTE_INTERVAL_MONTH_SETTINGS_ID,
  VOTE_INTERVAL_SETTINGS_ID,
  VOTE_INTERVAL_WEEK_SETTINGS_ID,
} from "@/lib/settings";
import { testLlmConnection } from "@/lib/llm";
import {
  COMMENT_SUFFIXES,
  DEFAULTS,
  FOLLOWER_MAX_POWER,
  LEADER_POWER_THRESHOLD,
  MAX_VOTE_INTERVAL_MINUTES,
  MIN_VOTE_INTERVAL_MINUTES,
  type CommentSuffix,
} from "@/lib/constants";
import { validateCatIconFile } from "@/lib/image-upload";
import { nextVoteDue } from "@/lib/scheduler";
import { catIconProxyUrl, isCatIconProxyUrl } from "@/lib/cat-icon";

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
    access: "private",
    addRandomSuffix: false,
    contentType: imageFile.type,
    cacheControlMaxAge: 31536000,
  });
  return catIconProxyUrl(blob.pathname);
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
  const currentIconRaw = String(formData.get("currentIcon") ?? "").trim().slice(0, 1000);
  const clearIconImage = formData.get("clearIconImage") === "1";
  const genderRaw = String(formData.get("gender") ?? "セン").trim();
  const gender = ["オス", "メス", "セン"].includes(genderRaw)
    ? (genderRaw as "オス" | "メス" | "セン")
    : null;
  const commentSuffixRaw = String(formData.get("commentSuffix") ?? "普通").trim();
  const commentSuffix = COMMENT_SUFFIXES.includes(commentSuffixRaw as CommentSuffix)
    ? (commentSuffixRaw as CommentSuffix)
    : "普通";
  const powerRaw = Number(formData.get("power") ?? 1);
  const power = Number.isFinite(powerRaw)
    ? Math.max(1, Math.min(10, Math.round(powerRaw)))
    : 1;
  const wantsLeader = formData.get("isLeader") === "1";
  const factionIdRaw = String(formData.get("factionId") ?? "").trim();
  const factionId = power <= FOLLOWER_MAX_POWER && !wantsLeader ? factionIdRaw || null : null;

  let iconUrl: string | null = null;
  if (iconUrlRaw) {
    if (isCatIconProxyUrl(iconUrlRaw)) {
      iconUrl = iconUrlRaw;
    } else {
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
  }
  if (!name) return { error: "名前は必須です" };
  if (!gender) return { error: "性別を選択してください" };
  if (wantsLeader && power < LEADER_POWER_THRESHOLD) {
    return { error: "リーダーにできるのは権力8以上の猫だけです" };
  }
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
  const icon = uploadedIconUrl
    ?? iconUrl
    ?? (!clearIconImage && isCatIconProxyUrl(currentIconRaw) ? currentIconRaw : null)
    ?? (iconInput.slice(0, 16) || "🐱");

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
        // Production may still have legacy NOT NULL columns from before the
        // type and permanent-parameter fields were removed from the product.
        // Keep those fields out of the app while supplying compatibility data
        // only when the old columns actually exist in the connected database.
        const legacyColumnRows = (await tx.execute(sql`
          select column_name
          from information_schema.columns
          where table_schema = current_schema()
            and table_name = 'cats'
            and column_name in ('type', 'permanent_params')
        `)) as Array<{ column_name: string }>;
        const legacyColumns = new Set(legacyColumnRows.map((row) => row.column_name));

        if (legacyColumns.has("type")) {
          if (legacyColumns.has("permanent_params")) {
            await tx.execute(sql`
              insert into "cats" ("id", "name", "type", "icon", "gender", "power", "permanent_params")
              values (${id}, ${name}, ${name}, ${icon}, ${gender}, ${power}, '{}'::jsonb)
            `);
          } else {
            await tx.execute(sql`
              insert into "cats" ("id", "name", "type", "icon", "gender", "power")
              values (${id}, ${name}, ${name}, ${icon}, ${gender}, ${power})
            `);
          }
        } else {
          await tx.insert(cats).values({ id, name, icon, gender, commentSuffix, power });
        }
      } else {
        const existing = (await tx.select({ id: cats.id }).from(cats).where(eq(cats.id, id)).limit(1))[0];
        if (!existing) throw new Error("cat not found");
      }

    const currentMembership = (
      await tx
        .select({
          membership: factionMemberships,
          factionId: factions.id,
          factionLeaderId: factions.leaderId,
        })
        .from(factionMemberships)
        .innerJoin(factions, eq(factionMemberships.factionId, factions.id))
          .where(and(eq(factionMemberships.catId, id), isNull(factionMemberships.leftTurn)))
          .orderBy(desc(factionMemberships.joinedTurn))
          .limit(1)
      )[0];
    const currentFactionId = currentMembership?.membership.factionId ?? null;
    const latestTurn = Number(
      (await tx.select({ value: max(turns.number) }).from(turns))[0]?.value ?? -1,
    );
    const changeTurn = latestTurn + 1;

    let desiredFaction: { id: string; name: string; leaderId: string } | null = selectedFaction
      ? { id: selectedFaction.id, name: selectedFaction.name, leaderId: selectedFaction.leaderId }
      : null;
    if (wantsLeader) {
      const factionName = `${name}派`;
      if (currentMembership?.factionLeaderId === id && currentMembership.factionId) {
        desiredFaction = {
          id: currentMembership.factionId,
          name: factionName,
          leaderId: id,
        };
        await tx
          .update(factions)
          .set({ name: factionName, leaderId: id })
          .where(eq(factions.id, currentMembership.factionId));
      } else {
        const created = (
          await tx
            .insert(factions)
            .values({ name: factionName, leaderId: id, foundedTurn: changeTurn })
            .returning({ id: factions.id, name: factions.name, leaderId: factions.leaderId })
        )[0];
        if (!created) throw new Error("faction creation failed");
        desiredFaction = created;
      }
    } else if (desiredFaction) {
      const leader = (
        await tx.select({ name: cats.name }).from(cats).where(eq(cats.id, desiredFaction.leaderId)).limit(1)
      )[0];
      const factionName = `${leader?.name ?? desiredFaction.name}派`;
      desiredFaction = { ...desiredFaction, name: factionName };
      await tx
        .update(factions)
        .set({ name: factionName })
        .where(eq(factions.id, desiredFaction.id));
    }

    const desiredFactionId = desiredFaction?.id ?? null;
    let factionEvent: { type: string; payload: Record<string, unknown> } | null = null;
    let assignmentTurn = 0;

      if (currentFactionId !== desiredFactionId) {
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
        if (desiredFaction) {
          const role = desiredFaction.leaderId === id ? "leader" : "follower";
          await tx.insert(factionMemberships).values({
            factionId: desiredFaction.id,
            catId: id,
            role,
            joinedTurn: changeTurn,
          });
          factionEvent = {
            type: "FactionJoined",
            payload: {
              cat_id: id,
              cat_name: name,
              faction: desiredFaction.name,
              reason: "admin_assignment",
            },
          };
        }
      }

      await tx
        .update(cats)
        .set({
          name,
          icon,
          gender,
          commentSuffix,
          power,
          factionId: desiredFaction?.id ?? null,
          leaderId: desiredFaction?.leaderId ?? null,
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

  const legacyInterval = numOrNull(
    "voteIntervalMinutes",
    MIN_VOTE_INTERVAL_MINUTES,
    MAX_VOTE_INTERVAL_MINUTES,
  );
  const voteIntervals = {
    within24h:
      numOrNull("voteIntervalWithin24h", MIN_VOTE_INTERVAL_MINUTES, MAX_VOTE_INTERVAL_MINUTES) ??
      legacyInterval ??
      DEFAULTS.voteIntervals.within24h,
    withinWeek:
      numOrNull("voteIntervalWithinWeek", MIN_VOTE_INTERVAL_MINUTES, MAX_VOTE_INTERVAL_MINUTES) ??
      legacyInterval ??
      DEFAULTS.voteIntervals.withinWeek,
    withinMonth:
      numOrNull("voteIntervalWithinMonth", MIN_VOTE_INTERVAL_MINUTES, MAX_VOTE_INTERVAL_MINUTES) ??
      legacyInterval ??
      DEFAULTS.voteIntervals.withinMonth,
    afterMonth:
      numOrNull("voteIntervalAfterMonth", MIN_VOTE_INTERVAL_MINUTES, MAX_VOTE_INTERVAL_MINUTES) ??
      legacyInterval ??
      DEFAULTS.voteIntervals.afterMonth,
  };
  const runoffIntervalMinutes =
    numOrNull("runoffVoteIntervalMinutes", MIN_VOTE_INTERVAL_MINUTES, MAX_VOTE_INTERVAL_MINUTES) ??
    legacyInterval ??
    DEFAULTS.voteIntervalMinutes;

  const db = getDb();
  await db.transaction(async (tx) => {
    await tx
      .insert(systemSettings)
      .values({ id: 1, ...values })
      .onConflictDoUpdate({ target: systemSettings.id, set: values });
    const intervalRows = [
      { id: VOTE_INTERVAL_SETTINGS_ID, minutes: voteIntervals.within24h },
      { id: VOTE_INTERVAL_WEEK_SETTINGS_ID, minutes: voteIntervals.withinWeek },
      { id: VOTE_INTERVAL_MONTH_SETTINGS_ID, minutes: voteIntervals.withinMonth },
      { id: VOTE_INTERVAL_AFTER_MONTH_SETTINGS_ID, minutes: voteIntervals.afterMonth },
      { id: RUNOFF_INTERVAL_SETTINGS_ID, minutes: runoffIntervalMinutes },
    ];
    for (const interval of intervalRows) {
      await tx
        .insert(systemSettings)
        .values({
          id: interval.id,
          runoffTurnLimit: interval.minutes,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: systemSettings.id,
          set: { runoffTurnLimit: interval.minutes, updatedAt: new Date() },
        });
    }

    // Apply a changed interval to currently open proposals too. Their next
    // schedule uses the current age bucket, so the new setting takes effect
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
        await tx
          .update(opinions)
          .set({ nextVoteDue: nextVoteDue(opinion.createdAt, new Date(), voteIntervals) })
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
  revalidatePath("/");
}

export async function moderateProposalAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const proposalId = String(formData.get("proposalId") ?? "");
  const p = (
    await getDb().select().from(proposals).where(eq(proposals.id, proposalId)).limit(1)
  )[0];
  if (!p) return;
  const deletedAt = new Date();
  await getDb().transaction(async (tx) => {
    await tx
      .update(proposals)
      .set({ deletedAt, status: "CLOSED", turnLockedUntil: null })
      .where(eq(proposals.id, proposalId));
    await tx
      .update(opinions)
      .set({ deletedAt, eligible: false })
      .where(and(eq(opinions.proposalId, proposalId), isNull(opinions.deletedAt)));
  });
  revalidatePath("/admin");
  revalidatePath("/");
  revalidatePath(`/proposals/${proposalId}`);
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

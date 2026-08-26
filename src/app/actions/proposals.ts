"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { cats, opinions, proposals, reports, users, proposalParameters, proposalCatValues } from "@/db/schema";
import { getDb } from "@/db";
import { getSession, requireUser } from "@/lib/auth";
import { executeTurn } from "@/lib/rules/turn";
import { beginRunoff } from "@/lib/catchup";
import { OPINION_RATE_LIMIT_MS } from "@/lib/constants";
import { opinionContentSchema, parseDateTimeLocal, uuidSchema } from "@/lib/validation";

export interface OpinionActionState {
  error?: string;
  success?: string;
}

export async function createProposalAction(
  formData: FormData,
): Promise<void> {
  const session = await requireUser("/proposals/new");
  const user = (await getDb().select().from(users).where(eq(users.id, session.userId)).limit(1))[0];
  if (!user || user.bannedAt) redirect("/");

  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const deadlineRaw = String(formData.get("deadline") ?? "");
  const deadline = parseDateTimeLocal(deadlineRaw, formData.get("deadlineTimezone"));
  const paramNames = formData
    .getAll("paramName")
    .map((v) => String(v).trim())
    .filter((v) => v.length > 0)
    .slice(0, 5);

  if (!title || title.length > 120) {
    redirect("/proposals/new?error=title");
  }
  if (description.length > 4000) {
    redirect("/proposals/new?error=description");
  }
  if (paramNames.some((name) => name.length > 20)) {
    redirect("/proposals/new?error=params");
  }
  if (isNaN(deadline.getTime()) || deadline.getTime() <= Date.now()) {
    redirect("/proposals/new?error=deadline");
  }
  if (paramNames.length === 0) {
    redirect("/proposals/new?error=params");
  }
  if (new Set(paramNames).size !== paramNames.length) {
    redirect("/proposals/new?error=dup");
  }

  const activeCats = await getDb().select().from(cats).where(eq(cats.active, true));
  if (activeCats.length === 0) {
    redirect("/proposals/new?error=nocats");
  }

  const valuesRows = activeCats.map((c) => {
    const values: Record<string, number> = {};
    for (const p of paramNames) {
      const raw = formData.get(`cv:${c.id}:${p}`);
      const n = Number(raw);
      values[p] = Number.isFinite(n) ? Math.max(1, Math.min(10, Math.round(n))) : 5;
    }
    return { catId: c.id, values };
  });
  const proposal = await getDb().transaction(async (tx) => {
    const [createdProposal] = await tx
      .insert(proposals)
      .values({
        title,
        description,
        authorId: session.userId,
        status: "OPEN",
        deadline,
      })
      .returning();
    if (!createdProposal) throw new Error("proposal insert failed");

    await tx.insert(proposalParameters).values(
      paramNames.map((name, i) => ({
        proposalId: createdProposal.id,
        name,
        sortOrder: i,
      })),
    );
    await tx.insert(proposalCatValues).values(
      valuesRows.map((row) => ({ ...row, proposalId: createdProposal.id })),
    );
    return createdProposal;
  });

  revalidatePath("/");
  redirect(`/proposals/${proposal.id}`);
}

export async function postOpinionAction(
  _prev: OpinionActionState,
  formData: FormData,
): Promise<OpinionActionState> {
  const proposalId = String(formData.get("proposalId") ?? "");
  if (!uuidSchema.safeParse(proposalId).success) {
    return { error: "この議題には投稿できません" };
  }
  const parsed = opinionContentSchema.safeParse(formData.get("content"));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "意見を入力してください" };
  }

  const session = await getSession();
  if (!session) {
    return { error: "投稿にはログインが必要です" };
  }
  const user = (
    await getDb().select().from(users).where(eq(users.id, session.userId)).limit(1)
  )[0];
  if (!user || user.bannedAt) {
    return { error: "投稿できません" };
  }

  const proposal = (
    await getDb().select().from(proposals).where(eq(proposals.id, proposalId)).limit(1)
  )[0];
  if (
    !proposal ||
    proposal.deletedAt ||
    proposal.status !== "OPEN" ||
    proposal.deadline.getTime() <= Date.now()
  ) {
    return { error: "この議題には投稿できません" };
  }

  const inserted = await getDb().transaction(async (tx) => {
    // Serialize the rate-limit check and insert for concurrent submissions.
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`opinion:${session.userId}:${proposalId}`}))`,
    );
    const recent = await tx
      .select({ createdAt: opinions.createdAt })
      .from(opinions)
      .where(and(eq(opinions.proposalId, proposalId), eq(opinions.authorId, session.userId)))
      .orderBy(desc(opinions.createdAt))
      .limit(1);
    const last = recent[0]?.createdAt;
    if (last && Date.now() - last.getTime() < OPINION_RATE_LIMIT_MS) {
      const waitMin = Math.ceil(
        (OPINION_RATE_LIMIT_MS - (Date.now() - last.getTime())) / 60000,
      );
      return { opinion: null, error: `連続投稿を防ぐため、あと${waitMin}分待ってから投稿してください` } as const;
    }
    const [opinion] = await tx
      .insert(opinions)
      .values({
        proposalId,
        authorId: session.userId,
        content: parsed.data,
        nextVoteDue: new Date(),
      })
      .returning();
    if (!opinion) throw new Error("opinion insert failed");
    return { opinion, error: undefined } as const;
  });
  if (!inserted.opinion) return { error: inserted.error ?? "投稿に失敗しました" };
  const opinion = inserted.opinion;

  try {
    await executeTurn({
      proposalId,
      kind: "initial",
      dueOpinionIds: [opinion.id],
    });
  } catch (err) {
    console.error("[postOpinion] initial turn failed:", err);
  }

  revalidatePath(`/proposals/${proposalId}`);
  revalidatePath("/");
  return { success: "意見を投稿しました。猫たちの投票をお楽しみに 🐾" };
}

export async function startRunoffAction(formData: FormData): Promise<void> {
  const proposalId = String(formData.get("proposalId") ?? "");
  if (!uuidSchema.safeParse(proposalId).success) redirect("/");
  const session = await getSession();
  if (!session) redirect(`/proposals/${proposalId}`);
  const proposal = (
    await getDb().select().from(proposals).where(eq(proposals.id, proposalId)).limit(1)
  )[0];
  const isAllowed =
    proposal &&
    !proposal.deletedAt &&
    proposal.status === "RUNOFF_PENDING" &&
    (session.role === "admin" || proposal.authorId === session.userId);
  if (isAllowed) {
    await beginRunoff(proposalId);
    revalidatePath(`/proposals/${proposalId}`);
  }
  redirect(`/proposals/${proposalId}`);
}

export async function reportTargetAction(formData: FormData): Promise<void> {
  const targetTypeRaw = String(formData.get("targetType") ?? "");
  const targetId = String(formData.get("targetId") ?? "");
  const reason = String(formData.get("reason") ?? "").slice(0, 500);
  const session = await getSession();
  if (
    !session ||
    !["opinion", "proposal"].includes(targetTypeRaw) ||
    !uuidSchema.safeParse(targetId).success
  ) {
    return;
  }
  const targetType = targetTypeRaw as "opinion" | "proposal";
  const target =
    targetType === "opinion"
      ? await getDb()
          .select({ id: opinions.id })
          .from(opinions)
          .where(and(eq(opinions.id, targetId), isNull(opinions.deletedAt)))
          .limit(1)
      : await getDb()
          .select({ id: proposals.id })
          .from(proposals)
          .where(and(eq(proposals.id, targetId), isNull(proposals.deletedAt)))
          .limit(1);
  if (target.length === 0) return;
  const dup = await getDb()
    .select({ id: reports.id })
    .from(reports)
    .where(
      and(
        eq(reports.reporterId, session.userId),
        eq(reports.targetId, targetId),
        isNull(reports.resolvedAt),
      ),
    )
    .limit(1);
  if (dup.length === 0) {
    await getDb().insert(reports).values({
      reporterId: session.userId,
      targetType,
      targetId,
      reason,
    });
  }
  revalidatePath("/admin");
}

export async function deleteOpinionAction(formData: FormData): Promise<void> {
  const opinionId = String(formData.get("opinionId") ?? "");
  if (!uuidSchema.safeParse(opinionId).success) return;
  const session = await getSession();
  if (!session || !opinionId) return;
  const op = (
    await getDb().select().from(opinions).where(eq(opinions.id, opinionId)).limit(1)
  )[0];
  if (!op || op.deletedAt) return;
  if (session.role !== "admin" && op.authorId !== session.userId) return;

  await getDb()
    .update(opinions)
    .set({ deletedAt: new Date(), eligible: false })
    .where(eq(opinions.id, opinionId));
  revalidatePath(`/proposals/${op.proposalId}`);
}

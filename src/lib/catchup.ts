import { and, asc, desc, eq, inArray, isNull, lte, sql } from "drizzle-orm";
import { events, opinions, proposals, votes } from "@/db/schema";
import type { Vote } from "@/db/schema";
import { getDb } from "@/db";
import { executeTurn } from "@/lib/rules/turn";
import { computeOpinionStats } from "@/lib/rules/points";
import { SeededRandom } from "@/lib/rng";
import { getEffectiveSettings } from "@/lib/settings";
import {
  DEFAULTS,
  MAX_CATCHUP_TURNS,
  RUNOFF_AUTO_START_HOURS,
} from "@/lib/constants";

export interface CatchupSummary {
  turns: number;
  status: string;
}

async function loadProposal(pid: string) {
  return (
    await getDb().select().from(proposals).where(eq(proposals.id, pid)).limit(1)
  )[0];
}

async function hasDueOpinion(pid: string): Promise<boolean> {
  const rows = await getDb()
    .select({ id: opinions.id })
    .from(opinions)
    .where(
      and(
        eq(opinions.proposalId, pid),
        isNull(opinions.deletedAt),
        eq(opinions.eligible, true),
        lte(opinions.nextVoteDue, new Date()),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

export async function rankEligibleOpinions(pid: string) {
  return getDb()
    .select()
    .from(opinions)
    .where(
      and(
        eq(opinions.proposalId, pid),
        isNull(opinions.deletedAt),
        eq(opinions.eligible, true),
      ),
    )
    .orderBy(desc(opinions.point), asc(opinions.createdAt));
}

async function insertEvent(
  pid: string,
  type: string,
  payload: Record<string, unknown>,
) {
  await getDb().insert(events).values({
    proposalId: pid,
    turnNumber: null,
    type,
    payload,
  });
}

export async function finalizeAfterDeadline(pid: string): Promise<string> {
  const db = getDb();
  const ranked = await rankEligibleOpinions(pid);

  if (ranked.length === 0) {
    const updated = await db
      .update(proposals)
      .set({ status: "CLOSED" })
      .where(and(eq(proposals.id, pid), eq(proposals.status, "OPEN")))
      .returning({ id: proposals.id });
    if (updated.length === 0) return (await loadProposal(pid))?.status ?? "UNKNOWN";
    await insertEvent(pid, "ProposalFinished", {
      winner_opinion_id: null,
      note: "no_opinions",
    });
    return "CLOSED";
  }

  const isTie = ranked.length >= 2 && ranked[1].point === ranked[0].point;
  if (isTie) {
    const updated = await db
      .update(proposals)
      .set({
        status: "RUNOFF_PENDING",
        runoffAutoStartAt: new Date(Date.now() + RUNOFF_AUTO_START_HOURS * 3600_000),
      })
      .where(and(eq(proposals.id, pid), eq(proposals.status, "OPEN")))
      .returning({ id: proposals.id });
    if (updated.length === 0) return (await loadProposal(pid))?.status ?? "UNKNOWN";
    await insertEvent(pid, "RunoffPending", {
      top_point: ranked[0].point,
      tied_count: ranked.filter((o) => o.point === ranked[0].point).length,
    });
    return "RUNOFF_PENDING";
  }

  const updated = await db
    .update(proposals)
    .set({ status: "CLOSED", adoptedOpinionId: ranked[0].id })
    .where(and(eq(proposals.id, pid), eq(proposals.status, "OPEN")))
    .returning({ id: proposals.id });
  if (updated.length === 0) return (await loadProposal(pid))?.status ?? "UNKNOWN";
  await insertEvent(pid, "ProposalFinished", {
    winner_opinion_id: ranked[0].id,
    winner_snippet: ranked[0].content.slice(0, 60),
    point: ranked[0].point,
  });
  return "CLOSED";
}

export async function beginRunoff(pid: string): Promise<boolean> {
  const db = getDb();
  return db.transaction(async (tx) => {
    const p = (
      await tx.select().from(proposals).where(eq(proposals.id, pid)).limit(1)
    )[0];
    if (!p || p.status !== "RUNOFF_PENDING") return false;

    const ranked = await tx
      .select()
      .from(opinions)
      .where(and(eq(opinions.proposalId, pid), isNull(opinions.deletedAt), eq(opinions.eligible, true)))
      .orderBy(desc(opinions.point), asc(opinions.createdAt));
    const topPoint = ranked[0]?.point ?? 0;
    const tiedIds = ranked.filter((o) => o.point === topPoint).map((o) => o.id);

    const updated = await tx
      .update(proposals)
      .set({
        status: "RUNOFF",
        runoffStartedAt: new Date(),
        runoffAutoStartAt: null,
        runoffTurnsDone: 0,
      })
      .where(and(eq(proposals.id, pid), eq(proposals.status, "RUNOFF_PENDING")))
      .returning({ id: proposals.id });
    if (updated.length === 0) return false;

    await tx
      .update(opinions)
      .set({ eligible: false })
      .where(and(eq(opinions.proposalId, pid), isNull(opinions.deletedAt)));
    if (tiedIds.length > 0) {
      await tx.update(opinions).set({ eligible: true }).where(inArray(opinions.id, tiedIds));
    }
    await tx.insert(events).values({
      proposalId: pid,
      turnNumber: null,
      type: "RunoffStarted",
      payload: { opinion_ids: tiedIds, count: tiedIds.length },
    });
    return true;
  });
}

async function latestScoresOf(opinionId: string): Promise<number[]> {
  const rows: Pick<Vote, "catId" | "score">[] = await getDb()
    .select({ catId: votes.catId, score: votes.score })
    .from(votes)
    .where(eq(votes.opinionId, opinionId))
    .orderBy(desc(votes.createdAt));
  const seen = new Map<string, number>();
  for (const r of rows) if (!seen.has(r.catId)) seen.set(r.catId, r.score);
  return [...seen.values()];
}

export async function finalizeRunoff(pid: string): Promise<void> {
  const db = getDb();
  const candidates = await rankEligibleOpinions(pid);
  if (candidates.length === 0) {
    await db.update(proposals).set({ status: "CLOSED" }).where(eq(proposals.id, pid));
    return;
  }

  const scored: {
    id: string;
    content: string;
    point: number;
    absSum: number;
    avg: number;
    polarization: number;
  }[] = [];

  for (const o of candidates) {
    const scores = await latestScoresOf(o.id);
    const st = computeOpinionStats(
      Object.fromEntries(scores.map((s, i) => [String(i), s])),
    );
    scored.push({
      id: o.id,
      content: o.content,
      point: o.point,
      absSum: scores.reduce((a, b) => a + Math.abs(b), 0),
      avg: st.avg,
      polarization: st.polarization,
    });
  }

  scored.sort((a, b) => {
    if (b.point !== a.point) return b.point - a.point;
    if (b.absSum !== a.absSum) return b.absSum - a.absSum;
    if (b.avg !== a.avg) return b.avg - a.avg;
    return a.polarization - b.polarization;
  });

  let winner = scored[0];
  const ties = scored.filter(
    (s) => s.point === scored[0].point && s.absSum === scored[0].absSum,
  );
  if (ties.length > 1) {
    const rng = new SeededRandom(`${pid}:final-tiebreak`);
    winner = rng.pick(ties);
  }

  const updated = await db
    .update(proposals)
    .set({ status: "CLOSED", adoptedOpinionId: winner.id })
    .where(and(eq(proposals.id, pid), eq(proposals.status, "RUNOFF")))
    .returning({ id: proposals.id });
  if (updated.length === 0) return;
  await insertEvent(pid, "ProposalFinished", {
    winner_opinion_id: winner.id,
    winner_snippet: winner.content.slice(0, 60),
    point: winner.point,
    via: "runoff",
  });
}

export async function processProposalCatchup(pid: string): Promise<CatchupSummary> {
  const db = getDb();
  const settings = await getEffectiveSettings();
  const runoffLimit = settings.runoffTurnLimit ?? DEFAULTS.runoffTurnLimit;
  const voteIntervalMs = settings.voteIntervalMinutes * 60_000;
  let turnsRun = 0;
  let safety = 0;

  while (safety++ < MAX_CATCHUP_TURNS * 2) {
    const p = await loadProposal(pid);
    if (!p || p.deletedAt) break;

    if (p.status === "OPEN") {
      if (new Date() >= p.deadline) {
        await finalizeAfterDeadline(pid);
        continue;
      }
      if (!(await hasDueOpinion(pid))) break;
      const r = await executeTurn({ proposalId: pid, kind: "regular" });
      if (!r.ok || r.skipped) break;
      turnsRun++;
      continue;
    }

    if (p.status === "RUNOFF_PENDING") {
      if (p.runoffAutoStartAt && new Date() >= p.runoffAutoStartAt) {
        await beginRunoff(pid);
        continue;
      }
      break;
    }

    if (p.status === "RUNOFF") {
      if ((p.runoffTurnsDone ?? 0) >= runoffLimit) {
        await finalizeRunoff(pid);
        continue;
      }
      const started = p.runoffStartedAt?.getTime() ?? Date.now();
      const nextAt = new Date(started + (p.runoffTurnsDone ?? 0) * voteIntervalMs);
      if (new Date() < nextAt) break;
      const r = await executeTurn({ proposalId: pid, kind: "runoff" });
      if (!r.ok) break;
      if (r.skipped) {
        await db
          .update(opinions)
          .set({ nextVoteDue: new Date(Date.now() + voteIntervalMs) })
          .where(and(eq(opinions.proposalId, pid), eq(opinions.eligible, true)));
      }
      await db
        .update(proposals)
        .set({ runoffTurnsDone: sql`${proposals.runoffTurnsDone} + 1` })
        .where(eq(proposals.id, pid));
      turnsRun++;
      continue;
    }

    break;
  }

  const final = await loadProposal(pid);
  return { turns: turnsRun, status: final?.status ?? "UNKNOWN" };
}

export async function processAllActiveProposals(): Promise<{
  processed: number;
  results: Record<string, CatchupSummary>;
}> {
  const rows = await getDb()
    .select({ id: proposals.id })
    .from(proposals)
    .where(inArray(proposals.status, ["OPEN", "RUNOFF_PENDING", "RUNOFF"]))
    .orderBy(desc(proposals.createdAt))
    .limit(50);
  const results: Record<string, CatchupSummary> = {};
  for (const r of rows) {
    try {
      results[r.id] = await processProposalCatchup(r.id);
    } catch (err) {
      console.error(`[catchup] proposal ${r.id} failed:`, err);
    }
  }
  return { processed: rows.length, results };
}

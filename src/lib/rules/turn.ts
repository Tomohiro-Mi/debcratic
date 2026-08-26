import { and, asc, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import {
  cats,
  events,
  factions,
  factionMemberships,
  llmLogs,
  opinions,
  proposalParameters,
  proposalCatValues,
  proposals,
  turns,
  votes,
} from "@/db/schema";
import { getDb } from "@/db";
import { TURN_LOCK_SECONDS } from "@/lib/constants";
import { runVote, type LLMCatContext } from "@/lib/llm";
import { nextVoteDue, runoffVoteDue } from "@/lib/scheduler";
import { stanceOf } from "@/lib/rules/points";
import {
  simulateSocialTurn,
  type OpinionTurnResult,
  type SimCat,
  type SimFaction,
} from "@/lib/rules/faction";
import { getEffectiveSettings } from "@/lib/settings";

export interface TurnResult {
  ok: boolean;
  turnNumber?: number;
  votesCast?: number;
  skipped?: boolean;
  reason?: string;
}

interface HistEntry {
  opinionId: string;
  catId: string;
  score: number;
  stance: "for" | "neutral" | "against";
  reason: string;
  turnNumber: number;
}

async function claimProposal(pid: string): Promise<boolean> {
  const db = getDb();
  const now = new Date();
  const rows = await db
    .update(proposals)
    .set({ turnLockedUntil: new Date(now.getTime() + TURN_LOCK_SECONDS * 1000) })
    .where(
      and(
        eq(proposals.id, pid),
        isNull(proposals.deletedAt),
        inArray(proposals.status, ["OPEN", "RUNOFF"]),
        or(isNull(proposals.turnLockedUntil), lte(proposals.turnLockedUntil, now)),
      ),
    )
    .returning({ id: proposals.id });
  return rows.length > 0;
}

async function releaseClaim(pid: string) {
  await getDb()
    .update(proposals)
    .set({ turnLockedUntil: null })
    .where(eq(proposals.id, pid));
}

export async function executeTurn(opts: {
  proposalId: string;
  kind: "initial" | "regular" | "runoff";
  dueOpinionIds?: string[];
}): Promise<TurnResult> {
  const claimed = await claimProposal(opts.proposalId);
  if (!claimed) return { ok: false, reason: "locked_or_inactive" };

  try {
    return await getDb().transaction(async (tx) => {
      const p = (
        await tx.select().from(proposals).where(eq(proposals.id, opts.proposalId)).limit(1)
      )[0];
      if (!p || p.deletedAt || (p.status !== "OPEN" && p.status !== "RUNOFF")) {
        return { ok: false, reason: "not_active" };
      }

      const settings = await getEffectiveSettings();

      const paramRows = await tx
        .select()
        .from(proposalParameters)
        .where(eq(proposalParameters.proposalId, p.id))
        .orderBy(asc(proposalParameters.sortOrder));

      const catRows = await tx.select().from(cats).where(eq(cats.active, true));
      if (catRows.length === 0) return { ok: false, reason: "no_cats" };
      const nameById = new Map(catRows.map((c) => [c.id, c.name]));

      const cvRows = await tx
        .select()
        .from(proposalCatValues)
        .where(eq(proposalCatValues.proposalId, p.id));
      const cvByCat = new Map(cvRows.map((r) => [r.catId, r.values ?? {}]));

      const factionRows = await tx
        .select()
        .from(factions)
        .where(eq(factions.status, "active"));
      const msRows = await tx
        .select()
        .from(factionMemberships)
        .where(isNull(factionMemberships.leftTurn));

      const histRows = await tx
        .select({
          opinionId: votes.opinionId,
          catId: votes.catId,
          score: votes.score,
          stance: votes.stance,
          reason: votes.reason,
          turnNumber: turns.number,
        })
        .from(votes)
        .innerJoin(turns, eq(votes.turnId, turns.id))
        .where(eq(turns.proposalId, p.id))
        .orderBy(asc(turns.number));

      const latest = new Map<string, HistEntry>();
      for (const h of histRows) latest.set(`${h.opinionId}:${h.catId}`, h);

      const maxNRow = await tx
        .select({ m: sql<number>`coalesce(max(${turns.number}), 0)` })
        .from(turns)
        .where(eq(turns.proposalId, p.id));
      const turnNumber = Number(maxNRow[0]?.m ?? 0) + 1;

      let dueList;
      if (opts.kind === "initial") {
        dueList = await tx
          .select()
          .from(opinions)
          .where(
            and(
              eq(opinions.proposalId, p.id),
              isNull(opinions.deletedAt),
              inArray(opinions.id, opts.dueOpinionIds ?? []),
            ),
          );
      } else {
        const conds = [
          eq(opinions.proposalId, p.id),
          isNull(opinions.deletedAt),
          eq(opinions.eligible, true),
        ];
        if (opts.kind === "regular") conds.push(lte(opinions.nextVoteDue, new Date()));
        dueList = await tx.select().from(opinions).where(and(...conds));
      }

      if (!dueList || dueList.length === 0) {
        return { ok: true, skipped: true };
      }

      const seed = randomUUID();
      const insertedTurn = (
        await tx
          .insert(turns)
          .values({
            proposalId: p.id,
            number: turnNumber,
            kind: opts.kind,
            randomSeed: seed,
          })
          .returning()
      )[0];

      const windowStart = turnNumber - settings.changeWindow;
      const changeCounts: Record<string, number> = {};
      {
        const byKey = new Map<string, HistEntry[]>();
        for (const h of histRows) {
          const k = `${h.catId}:${h.opinionId}`;
          if (!byKey.has(k)) byKey.set(k, []);
          byKey.get(k)!.push(h);
        }
        for (const seq of byKey.values()) {
          for (let i = 1; i < seq.length; i++) {
            if (seq[i].stance !== seq[i - 1].stance && seq[i].turnNumber > windowStart) {
              changeCounts[seq[i].catId] = (changeCounts[seq[i].catId] ?? 0) + 1;
            }
          }
        }
      }

      const opinionResults: OpinionTurnResult[] = [];
      const uiEvents: { type: string; payload: Record<string, unknown> }[] = [];
        let votesCast = 0;

      for (const op of dueList) {
        const ctxCats: LLMCatContext[] = catRows.map((c) => {
          const myFaction =
            c.factionId != null ? factionRows.find((x) => x.id === c.factionId) : undefined;
          const leaderName = myFaction
            ? nameById.get(myFaction.leaderId) ?? null
            : null;
          return {
            id: c.id,
            name: c.name,
            power: c.power,
            topicParams: cvByCat.get(c.id) ?? {},
            factionName: myFaction?.name ?? null,
            leaderName,
            history: histRows
              .filter((h) => h.catId === c.id && h.opinionId === op.id)
              .slice(-3)
              .map((h) => ({ turn: h.turnNumber, score: h.score, reason: h.reason })),
          };
        });

        const result = await runVote(
          {
            opinionId: op.id,
            proposalTitle: p.title,
            proposalDescription: p.description,
            parameterNames: paramRows.map((x) => x.name),
            opinionContent: op.content,
            cats: ctxCats,
            seed: `${seed}:${op.id}`,
          },
          {
            apiKey: settings.apiKey,
            model: settings.llmModel,
            temperature: settings.temperature,
          },
        );

        await tx.insert(llmLogs).values({
          opinionId: op.id,
          turnId: insertedTurn.id,
          model: result.model,
          temperature: settings.temperature,
          promptVersion: result.promptVersion,
          inputHash: result.inputHash,
          output: result.votes as unknown as Record<string, unknown>,
          ok: true,
        });

        const mergedScores: Record<string, number> = {};
        const thisTurnScores: Record<string, number> = {};
        for (const c of catRows) {
          const prev = latest.get(`${op.id}:${c.id}`);
          if (prev) mergedScores[c.id] = prev.score;
        }
        for (const [cid, v] of Object.entries(result.votes)) {
          if (!nameById.has(cid)) continue;
          const prev = latest.get(`${op.id}:${cid}`);
          const stance = stanceOf(v.score);
          mergedScores[cid] = v.score;
          thisTurnScores[cid] = v.score;
          await tx.insert(votes).values({
            turnId: insertedTurn.id,
            opinionId: op.id,
            catId: cid,
            score: v.score,
            stance,
            reason: v.reason,
            confidence: v.confidence,
            factors: v.factors,
            model: result.model,
            promptVersion: result.promptVersion,
          });
          votesCast++;
          if (prev && prev.stance !== stance) {
            uiEvents.push({
              type: "VoteChanged",
              payload: {
                cat_id: cid,
                cat_name: nameById.get(cid) ?? cid,
                opinion_id: op.id,
                opinion_snippet: op.content.slice(0, 30),
                before_score: prev.score,
                after_score: v.score,
                before_stance: prev.stance,
                after_stance: stance,
              },
            });
          }
        }

        const prevPoint = op.point;
        const newPoint = Object.values(mergedScores).reduce((a, b) => a + b, 0);
        const nextDue =
          opts.kind === "runoff"
            ? runoffVoteDue(new Date(), settings.runoffVoteIntervalMinutes)
            : nextVoteDue(op.createdAt, new Date(), settings.voteIntervals);
        await tx
          .update(opinions)
          .set({
            point: newPoint,
            prevPoint,
            lastVotedAt: new Date(),
            nextVoteDue: nextDue,
          })
          .where(eq(opinions.id, op.id));

        if (newPoint !== prevPoint) {
          uiEvents.push({
            type: "OpinionPointChanged",
            payload: {
              opinion_id: op.id,
              opinion_snippet: op.content.slice(0, 40),
              before: prevPoint,
              after: newPoint,
            },
          });
        }

        opinionResults.push({
          opinionId: op.id,
          prevPoint,
          newPoint,
          scores: thisTurnScores,
        });
      }

      const simCats: SimCat[] = catRows.map((c) => {
        const mem = msRows.find((m) => m.catId === c.id);
        const fid = c.factionId ?? mem?.factionId ?? null;
        const f = fid ? factionRows.find((x) => x.id === fid) : undefined;
        const role = f ? (f.leaderId === c.id ? "leader" : "follower") : null;
        return {
          id: c.id,
          name: c.name,
          power: c.power,
          topicParams: cvByCat.get(c.id) ?? {},
          factionKey: fid,
          role,
          joinedTurn: mem?.joinedTurn ?? null,
        };
      });
      const simFactions: SimFaction[] = factionRows.map((f) => ({
        key: f.id,
        name: f.name,
        leaderId: f.leaderId,
        foundedTurn: f.foundedTurn,
      }));

      const out = simulateSocialTurn({
        turnNumber,
        seed,
        cats: simCats,
        factions: simFactions,
        opinionResults,
        stanceChangeCounts: changeCounts,
        settings: {
          exilePenaltyProb: settings.exilePenaltyProb,
          changeWindow: settings.changeWindow,
          changeThreshold: settings.changeThreshold,
        },
      });

      const keyToId = new Map<string, string>();
      for (const f of simFactions) keyToId.set(f.key, f.key);
      const newFacRows: {
        id: string;
        name: string;
        leaderId: string;
        foundedTurn: number;
      }[] = [];
      for (const nf of out.newFactions) {
        const id = randomUUID();
        keyToId.set(nf.key, id);
        newFacRows.push({
          id,
          name: nf.name,
          leaderId: nf.leaderId,
          foundedTurn: turnNumber,
        });
      }
      if (newFacRows.length > 0) {
        await tx.insert(factions).values(newFacRows);
      }

      const memByCat = new Map<
        string,
        { factionId: string; role: "leader" | "follower"; joinedTurn: number }
      >();
      for (const m of msRows) {
        if (!memByCat.has(m.catId)) {
          memByCat.set(m.catId, {
            factionId: m.factionId,
            role: m.role,
            joinedTurn: m.joinedTurn,
          });
        }
      }

      for (const mo of out.membershipOps) {
        const fid = keyToId.get(mo.factionKey);
        if (!fid) continue;
        if (mo.op === "join") {
          memByCat.set(mo.catId, {
            factionId: fid,
            role: mo.role,
            joinedTurn: turnNumber,
          });
          await tx.insert(factionMemberships).values({
            factionId: fid,
            catId: mo.catId,
            role: mo.role,
            joinedTurn: turnNumber,
          });
        } else {
          const cur = memByCat.get(mo.catId);
          if (cur && cur.factionId === fid) {
            await tx
              .update(factionMemberships)
              .set({ leftTurn: turnNumber })
              .where(
                and(
                  eq(factionMemberships.catId, mo.catId),
                  eq(factionMemberships.factionId, fid),
                  isNull(factionMemberships.leftTurn),
                ),
              );
            memByCat.delete(mo.catId);
          }
        }
      }

      for (const dk of out.dissolvedFactionKeys) {
        const fid = keyToId.get(dk);
        if (fid) {
          await tx
            .update(factions)
            .set({ status: "dissolved", dissolvedTurn: turnNumber })
            .where(eq(factions.id, fid));
        }
      }

      const leaderOfFaction = new Map<string, string>();
      for (const f of factionRows) leaderOfFaction.set(f.id, f.leaderId);
      for (const nf of newFacRows) leaderOfFaction.set(nf.id, nf.leaderId);

      for (const c of catRows) {
        const power = out.powers[c.id];
        const mem = memByCat.get(c.id);
        const factionChanged = (mem?.factionId ?? null) !== (c.factionId ?? null);
        if (power !== c.power || factionChanged) {
          await tx
            .update(cats)
            .set({
              power,
              factionId: mem?.factionId ?? null,
              leaderId: mem ? (leaderOfFaction.get(mem.factionId) ?? null) : null,
            })
            .where(eq(cats.id, c.id));
        }
      }

      const allEvents = [
        ...uiEvents,
        ...out.events,
      ].map((e) => ({
        proposalId: p.id,
        turnNumber,
        type: e.type,
        payload: e.payload,
      }));
      if (allEvents.length > 0) {
        await tx.insert(events).values(allEvents);
      }

      return { ok: true, turnNumber, votesCast };
    });
  } finally {
    await releaseClaim(opts.proposalId);
  }
}

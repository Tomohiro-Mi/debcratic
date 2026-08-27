import { and, asc, desc, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import {
  cats,
  events,
  factions,
  llmLogs,
  opinions,
  proposalParameters,
  proposalCatValues,
  proposals,
  turns,
  votes,
} from "@/db/schema";
import { getDb } from "@/db";
import { TURN_LOCK_SECONDS, VOTE_ENGINE_VERSION } from "@/lib/constants";
import {
  createRuleBasedOpinionParameters,
  calculateBayesianVotes,
  updateOpinionPosterior,
  type OpinionParameterState,
} from "@/lib/bayes";
import {
  generateVoteComments,
  type CommentGenerationInput,
  type LLMCatContext,
} from "@/lib/llm";
import { nextVoteDue, runoffVoteDue } from "@/lib/scheduler";
import { stanceOf } from "@/lib/rules/points";
import {
  simulateSocialTurn,
  type OpinionTurnResult,
  type SimCat,
  type SimFaction,
} from "@/lib/rules/faction";
import { getEffectiveSettings } from "@/lib/settings";
import {
  createInitialProposalSimulationState,
  parseProposalSimulationState,
  PROPOSAL_STATE_EVENT_TYPES,
  serializeProposalSimulationState,
  type ProposalSimulationState,
} from "@/lib/proposal-state";

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

      const allCatRows = await tx.select().from(cats).where(eq(cats.active, true));
      const stateEventRows = await tx
        .select({ payload: events.payload })
        .from(events)
        .where(
          and(
            eq(events.proposalId, p.id),
            inArray(events.type, [...PROPOSAL_STATE_EVENT_TYPES]),
          ),
        )
        .orderBy(desc(events.id))
        .limit(1);
      let simulationState = parseProposalSimulationState(stateEventRows[0]?.payload);
      if (!simulationState) {
        const initialFactionRows = await tx
          .select()
          .from(factions)
          .where(eq(factions.status, "active"));
        simulationState = createInitialProposalSimulationState(allCatRows, initialFactionRows);
      }

      const stateCatIds = new Set(Object.keys(simulationState.cats));
      const catRows = allCatRows.filter((cat) => stateCatIds.has(cat.id));
      if (catRows.length === 0) return { ok: false, reason: "no_cats" };
      const nameById = new Map(catRows.map((c) => [c.id, c.name]));

      const cvRows = await tx
        .select()
        .from(proposalCatValues)
        .where(eq(proposalCatValues.proposalId, p.id));
      const cvByCat = new Map(cvRows.map((r) => [r.catId, r.values ?? {}]));

      const factionRows = simulationState.factions;

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
          const stateCat = simulationState.cats[c.id];
          const myFaction =
            stateCat.factionKey
              ? factionRows.find((x) => x.key === stateCat.factionKey)
              : undefined;
          const leaderName = myFaction
            ? nameById.get(myFaction.leaderId) ?? null
            : null;
          return {
            id: c.id,
            name: c.name,
            power: stateCat.power,
            commentSuffix: c.commentSuffix,
            topicParams: cvByCat.get(c.id) ?? {},
            factionName: myFaction?.name ?? null,
            leaderName,
            leaderScore: myFaction
              ? latest.get(`${op.id}:${myFaction.leaderId}`)?.score ?? null
              : null,
            history: histRows
              .filter((h) => h.catId === c.id && h.opinionId === op.id)
              .slice(-3)
              .map((h) => ({ turn: h.turnNumber, score: h.score, reason: h.reason })),
          };
        });

        const parameterNames = paramRows.map((x) => x.name);
        // postOpinionAction seeds both fields with the semantic LLM result.
        // Therefore the first vote uses those initial values; subsequent turns
        // use the posterior updated at the end of this transaction.
        const opinionParameters: OpinionParameterState =
          Object.keys(op.parameterPosterior ?? {}).length > 0
            ? op.parameterPosterior
            : Object.keys(op.parameterPrior ?? {}).length > 0
              ? op.parameterPrior
              : createRuleBasedOpinionParameters(parameterNames, op.content, op.id);
        const result = calculateBayesianVotes({
          opinionId: op.id,
          opinionContent: op.content,
          parameterNames,
          opinionParameters,
          cats: ctxCats,
          seed: `${seed}:${op.id}`,
        });
        const commentInput: CommentGenerationInput = {
          opinionId: op.id,
          proposalTitle: p.title,
          proposalDescription: p.description,
          opinionContent: op.content,
          seed: `${seed}:${op.id}`,
          cats: ctxCats.map((cat) => ({
            id: cat.id,
            name: cat.name,
            commentSuffix: cat.commentSuffix,
            factionName: cat.factionName,
            topicParams: cat.topicParams,
            score: result[cat.id]?.score ?? 0,
            confidence: result[cat.id]?.confidence ?? 0.5,
            factors: result[cat.id]?.factors ?? [],
          })),
        };
        const commentResult = await generateVoteComments(commentInput, {
          apiKey: settings.apiKey,
          model: settings.commentModel,
          temperature: settings.temperature,
        });

        await tx.insert(llmLogs).values({
          opinionId: op.id,
          turnId: insertedTurn.id,
          model: commentResult.model,
          temperature: settings.temperature,
          promptVersion: commentResult.promptVersion,
          inputHash: commentResult.inputHash,
          output: commentResult.comments,
          ok: true,
        });

        const samples = ctxCats.map((cat) => ({
          values: cat.topicParams,
          score: result[cat.id]?.score ?? 0,
        }));
        const posterior = updateOpinionPosterior(opinionParameters, samples);
        await tx
          .update(opinions)
          .set({ parameterPosterior: posterior })
          .where(eq(opinions.id, op.id));

        const calculatedVotes = Object.fromEntries(
          ctxCats.map((cat) => [
            cat.id,
            {
              ...(result[cat.id] ?? { score: 0, confidence: 0.5, factors: [] }),
              reason: commentResult.comments[cat.id] ?? "",
            },
          ]),
        );

        const mergedScores: Record<string, number> = {};
        const thisTurnScores: Record<string, number> = {};
        for (const c of catRows) {
          const prev = latest.get(`${op.id}:${c.id}`);
          if (prev) mergedScores[c.id] = prev.score;
        }
        for (const [cid, v] of Object.entries(calculatedVotes)) {
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
            model: VOTE_ENGINE_VERSION,
            promptVersion: VOTE_ENGINE_VERSION,
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
        const stateCat = simulationState.cats[c.id];
        return {
          id: c.id,
          name: c.name,
          power: stateCat.power,
          topicParams: cvByCat.get(c.id) ?? {},
          factionKey: stateCat.factionKey,
          role: stateCat.role,
          joinedTurn: stateCat.joinedTurn,
        };
      });
      const simFactions: SimFaction[] = factionRows.map((f) => ({
        key: f.key,
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

      const memByCat = new Map<
        string,
        { factionKey: string; role: "leader" | "follower"; joinedTurn: number }
      >();
      for (const c of simCats) {
        if (c.factionKey && c.role) {
          memByCat.set(c.id, {
            factionKey: c.factionKey,
            role: c.role,
            joinedTurn: c.joinedTurn ?? 0,
          });
        }
      }

      const knownFactionKeys = new Set(factionRows.map((f) => f.key));
      for (const nf of out.newFactions) knownFactionKeys.add(nf.key);

      for (const mo of out.membershipOps) {
        if (!knownFactionKeys.has(mo.factionKey)) continue;
        if (mo.op === "join") {
          memByCat.set(mo.catId, {
            factionKey: mo.factionKey,
            role: mo.role,
            joinedTurn: turnNumber,
          });
        } else {
          const cur = memByCat.get(mo.catId);
          if (cur && cur.factionKey === mo.factionKey) memByCat.delete(mo.catId);
        }
      }

      const nextFactions: ProposalSimulationState["factions"] = factionRows
        .filter((f) => !out.dissolvedFactionKeys.includes(f.key))
        .concat(
          out.newFactions.map((f) => ({
            key: f.key,
            name: f.name,
            leaderId: f.leaderId,
            foundedTurn: turnNumber,
          })),
        );
      const leaderOfFaction = new Map(nextFactions.map((f) => [f.key, f.leaderId]));
      const nextCats: ProposalSimulationState["cats"] = { ...simulationState.cats };
      for (const c of catRows) {
        const current = simulationState.cats[c.id];
        const mem = memByCat.get(c.id);
        nextCats[c.id] = {
          power: out.powers[c.id] ?? current.power,
          factionKey: mem?.factionKey ?? null,
          role: mem?.role ?? null,
          joinedTurn: mem ? mem.joinedTurn : null,
        };
        if (mem && !leaderOfFaction.has(mem.factionKey)) {
          nextCats[c.id].factionKey = null;
          nextCats[c.id].role = null;
          nextCats[c.id].joinedTurn = null;
        }
      }
      const nextSimulationState: ProposalSimulationState = {
        cats: nextCats,
        factions: nextFactions,
      };

      const allEvents = [
        {
          type: "SimulationStateUpdated",
          payload: serializeProposalSimulationState(nextSimulationState),
        },
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
